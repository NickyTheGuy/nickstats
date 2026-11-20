"""HTTP + MySQL integration checks; only runs against the isolated CI database."""
from concurrent.futures import ThreadPoolExecutor
import base64
import hmac
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

assert os.environ.get('NICKSTATS_ANALYZER_INTEGRATION') == '1'
assert os.environ.get('MYSQL_DATABASE') == 'nickstats_analyzer_test'
env = {**os.environ, 'MYSQL_PWD': os.environ['MYSQL_PASSWORD']}

def sql(query, database=True):
    command = ['mysql', '-h', os.environ['MYSQL_HOST'], '-u', os.environ['MYSQL_USER'], '-N', '-B']
    if database:
        command += [os.environ['MYSQL_DATABASE']]
    return subprocess.check_output(command, input=query, text=True, env=env).strip()

root = Path(__file__).resolve().parents[3]
schema = (root/'database/schema.sql').read_text().replace('CREATE DATABASE IF NOT EXISTS nickstats', 'CREATE DATABASE IF NOT EXISTS nickstats_analyzer_test').replace('USE nickstats;', 'USE nickstats_analyzer_test;')
sql(schema, database=False)
assert sql('SELECT COUNT(*) FROM matches') == '0', 'Integration database must be empty'
sql("""
INSERT INTO parser_configs(id,config_sha256,rules_json) VALUES(1,UNHEX(REPEAT('a',64)),'{}');
INSERT INTO matches(id,demo_sha256,payload_schema,nickstats_build,parser_name,parser_version,parser_config_id,map_name,played_at,played_at_source,rounds)
VALUES(1,UNHEX(REPEAT('a',64)),'nickstats.match/27','integration','test','1',1,'de_mirage','2026-11-01 12:00:00','faceit_history',2);
INSERT INTO match_rounds(match_id,round_number,live_start_tick,end_tick,duration_ms,winner_side,bomb_plant_elapsed_ms) VALUES(1,1,0,64,1000,'CT',300);
INSERT INTO players(id,steam_id,current_name) VALUES(1,1,'One'),(2,2,'Two'),(3,3,'Three');
INSERT INTO match_teams(id,match_id,team_slot,source_team_id,display_name) VALUES(1,1,0,'a','A'),(2,1,1,'b','B');
INSERT INTO match_players(match_id,match_team_id,player_slot,player_id,display_name) VALUES(1,1,0,1,'One'),(1,1,1,2,'Two'),(1,2,2,3,'Three');
INSERT INTO player_round_phase_stats(match_id,match_player_id,round_number,side,round_result,stats_json)
VALUES(1,1,1,'CT','win','{"kda":[2,0,1,0,150],"kast_rounds":1}'),(1,1,2,'CT','win','{"kda":[0,1,0,0,25],"kast_rounds":0}');
INSERT INTO auth_users(username,password_salt,password_hash,password_iterations) VALUES('test',UNHEX(REPEAT('a',64)),UNHEX(REPEAT('b',64)),210000);
INSERT INTO account_manual_filters(id,username,name,cutoff_match_id) VALUES('tag','test','Preserve me',1);
INSERT INTO account_manual_filter_states(filter_id,match_id,state) VALUES('tag',1,'true');
""")

def request(path, body=None, method=None, auth=True, expected=200, cookie=None):
    headers = {'Content-Type': 'application/json'}
    if cookie:
        headers['Cookie'] = 'nickstats_session=' + cookie
    if auth:
        headers['Authorization'] = 'Bearer ' + os.environ['NICKSTATS_UPLOAD_TOKEN']
    data = None if body is None else json.dumps(body, separators=(',', ':')).encode()
    req = urllib.request.Request('http://127.0.0.1:8000'+path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status, content = response.status, response.read()
            if path == '/analyzer/utility/search' and status == 200:
                assert 'total;dur=' in response.headers.get('Server-Timing', '')
    except urllib.error.HTTPError as error:
        status, content = error.code, error.read()
    assert status == expected, (path, status, content[:500])
    return json.loads(content) if content else None

secret = 'integration-only-session-secret-32-characters'
server = subprocess.Popen([str(root/'backend/.build/debug/NickStatsAPI'), 'serve', '--hostname', '127.0.0.1', '--port', '8000'],env={**os.environ,'NICKSTATS_SESSION_SECRET':secret})
try:
    for attempt in range(60):
        try:
            request('/health')
            break
        except (urllib.error.URLError, AssertionError):
            time.sleep(.5)
    else:
        raise RuntimeError('API did not start')
    def session(username):
        payload = json.dumps({'username':username,'expiresAt':int(time.time())+600},separators=(',', ':')).encode()
        b64 = lambda data: base64.urlsafe_b64encode(data).decode().rstrip('=')
        return b64(payload)+'.'+b64(hmac.new(secret.encode(),payload,hashlib.sha256).digest())
    cookie = session('test')
    request('/auth/friends',auth=False,expected=401)
    request('/auth/friends',{'player_id':2,'friend':True},auth=False,expected=401)
    assert request('/auth/friends',cookie=cookie)['friends'] == []
    for _ in range(2):
        assert len(request('/auth/friends',{'player_id':2,'friend':True},cookie=cookie)['friends']) == 1
    request('/auth/friends',{'player_id':99999,'friend':True},cookie=cookie,expected=404)
    sql("INSERT INTO auth_users(username,password_salt,password_hash,password_iterations) SELECT 'other',password_salt,password_hash,password_iterations FROM auth_users WHERE username='test'")
    assert request('/auth/friends',cookie=session('other'))['friends'] == []
    assert request('/auth/friends',{'player_id':2,'friend':False},cookie=session('other'))['friends'] == []
    assert len(request('/auth/friends',cookie=cookie)['friends']) == 1
    assert request('/auth/friends',{'player_id':2,'friend':False},cookie=cookie)['friends'] == []
    header = {'format':'nickstats.replay','version':4,'coordinate_system':'source2-world','sample_hz':5,'projectile_hz':20,
              'match_uid':'sha256:'+'a'*64,'demo_sha256':'a'*64,'map':'de_mirage','source_file':'test.dem',
              'rules':{'regulation_rounds':24,'overtime_rounds':6},
              'players':[{'id':'steam:'+str(i),'steam_id':str(i),'name':str(i)} for i in range(1,4)]}
    rounds = [{'number':i,'duration':1000,'live_duration':600,'winner':'CT',
               'tracks':[{'player':'steam:1','samples':[[0,0,0,0,100,3,None],[200,1,2,0,100,3,45]]},
                         {'player':'steam:3','samples':[[0,10,10,0,100,2,None]]}],
               'context':[{'player':'steam:1','side':3,'result':'win','buy':'full','enemy_buy':'eco','hero':False}],
               'equipment':[{'player':'steam:1','samples':[[0,'ak47'],[200,'c4']]}],
               'blindness':[{'player':'steam:3','time':100,'duration':2500}],
               'utility':[],'firing':[],'projectiles':[],
               'deaths':[{'time':500,'victim':'steam:3','killer':'steam:1','victim_side':2,'killer_side':3,
                          'x':10,'y':10,'z':0,'from':[1,2,0],'weapon':'ak47','headshot':True}]} for i in [1,2]]
    rounds[1]['clock'] = {'round_ms':115000,'bomb_ms':40000,'round_estimated':False,'bomb_estimated':False}
    rounds[1]['bomb_events'] = [{'type':'plant','time':100,'player':'steam:3'},{'type':'defuse','time':900,'player':'steam:1'}]
    def grenade(kind,damage=None,enemies=None,blind=None,icon=None):
        return {'time':100,'end':900,'type':kind,'player':'steam:1','side':3,'x':10,'y':10,'z':0,
                'icon':icon or {'HE':'hegrenade','Flash':'flashbang','Fire':'molotov'}[kind],'radius':120 if kind=='Fire' else 0,'estimated':False,
                'effectiveness':{'enemy_damage':damage,'enemies_flashed':enemies,'enemy_blind_ms':blind}}
    rounds[0]['utility'] = [grenade('HE',40),grenade('HE',20),grenade('Flash',enemies=0,blind=0),grenade('Flash',enemies=2,blind=2000),
                            grenade('Fire',80),grenade('Fire',45,icon='incgrenade'),grenade('Fire')]
    rounds[1]['utility'] = [grenade('HE'),grenade('HE'),grenade('Fire',10),grenade('Flash',enemies=1,blind=500)]
    text = [json.dumps(r, separators=(',', ':')) for r in rounds]
    manifest = [{'number':r['number'],'parts':2,'bytes':len(t.encode()),'sha256':hashlib.sha256(t.encode()).hexdigest(),
                 'summary':{k:r[k] for k in ['number','duration','winner','context']} | {'player_ids':['steam:1','steam:3']}}
                for r,t in zip(rounds,text)]
    upload = {'header':header, 'rounds':manifest}
    request('/analyzer/matches/1/captures', upload, auth=False, expected=401)
    capture = request('/analyzer/matches/1/captures', upload)['capture']
    assert request('/analyzer/matches?players=1')['matches'][0].get('capture') is None
    request('/analyzer/captures/'+capture, expected=404)
    request('/analyzer/captures/'+capture+'/complete',method='POST',expected=409)
    for i,t in enumerate(text,1):
        cut = len(t)//2
        for part,value in enumerate([t[:cut],t[cut:]]):
            request(f'/analyzer/captures/{capture}/rounds/{i}/parts/{part}', {'data':value}, method='PUT', expected=204)
    request('/analyzer/captures/'+capture+'/complete',method='POST',expected=204)
    assert request('/analyzer/matches?players=1')['matches'][0]['capture'] == capture
    assert request('/analyzer/matches?match=1')['matches'][0]['players'][2]['team'] == 1
    assert len(request('/analyzer/matches?players=1&map=de_mirage')['matches']) == 1
    assert request('/analyzer/matches?players=1&map=de_nuke')['matches'] == []
    request('/analyzer/matches?players=1&map=bad%20map',expected=400)
    assert len(request('/analyzer/captures/'+capture)['rounds']) == 2
    assert len(request('/analyzer/indexes', {'captures':[capture]})['captures'][0]['rounds']) == 2
    selected = request('/analyzer/captures/'+capture+'/selection', {'rounds':[2], 'players':['steam:1']})
    assert len(selected['rounds']) == 1 and selected['rounds'][0]['number'] == 2
    assert selected['rounds'][0]['performance'] == [{'player':'steam:1','kills':0,'deaths':1,'assists':0,'damage':25,'kast':0}]
    assert len(selected['header']['players']) == 3 and len(selected['rounds'][0]['tracks']) == 1
    assert selected['rounds'][0]['deaths'][0]['victim'] == 'steam:3'
    assert selected['rounds'][0]['equipment'][0]['samples'][1] == [200,'c4']
    assert selected['rounds'][0]['blindness'] == []
    assert selected['rounds'][0]['bomb_events'] == rounds[1]['bomb_events']
    assert selected['rounds'][0]['clock']['bomb_ms'] == 40000
    both = request('/analyzer/captures/'+capture+'/selection', {'rounds':[1,2], 'players':['steam:1','steam:3']})
    assert [r['number'] for r in both['rounds']] == [1,2]
    assert all(len(r['tracks']) == 2 for r in both['rounds'])
    assert both['rounds'][0]['blindness'][0]['duration'] == 2500
    sql("UPDATE player_round_phase_stats SET stats_json=JSON_SET(stats_json,'$.utility_thrown',JSON_ARRAY(0,1,0,1,0),'$.utility',JSON_ARRAY(0,80),'$.profile',JSON_ARRAY(0,0,0,0,0,0,0,0,0,0,0,0,0,2,1500,0)) WHERE match_player_id=1 AND round_number=1")
    enriched = request('/analyzer/captures/'+capture+'/selection', {'rounds':[1], 'players':['steam:1']})
    assert enriched['rounds'][0]['live_duration'] == 600
    assert enriched['rounds'][0]['bomb_events'] == [{'type':'plant','time':300,'player':None}]
    grenade_totals = enriched['rounds'][0]['performance'][0]['grenades']
    assert grenade_totals['flash_thrown'] == 1 and grenade_totals['enemies_flashed'] == 2 and grenade_totals['fire_damage'] == 80 and grenade_totals['blind_ms'] == 1500
    query = {'scopes':[{'capture':capture,'rounds':[1,2]}],'players':['steam:1'],'type':'HE','metric':'damage','minimum':40}
    found = request('/analyzer/utility/search',query,auth=False)
    assert found['total'] == 1 and found['unknown'] == 2 and found['pending_captures'] == []
    assert found['rows'][0]['enemy_damage'] == 40
    assert request('/analyzer/utility/search',query | {'side':2})['total'] == 0
    assert request('/analyzer/utility/search',query | {'side':3})['total'] == 1
    request('/analyzer/utility/search',query | {'side':4},expected=400)
    fire = request('/analyzer/utility/search',query | {'type':'Fire'})
    assert fire['total'] == 2 and fire['unknown'] == 1 and {r['icon'] for r in fire['rows']} == {'molotov','incgrenade'}
    flash = request('/analyzer/utility/search',query | {'type':'Flash','metric':'enemies','minimum':1,'limit':1})
    assert flash['total'] == 2 and flash['rows'][0]['enemies_flashed'] == 2
    next_page = request('/analyzer/utility/search',query | {'type':'Flash','metric':'enemies','minimum':1,'limit':1,'offset':1})
    assert next_page['rows'][0]['enemies_flashed'] == 1
    assert request('/analyzer/utility/search',query | {'scopes':[{'capture':capture,'rounds':[2]}]})['total'] == 0
    request('/analyzer/utility/search',query | {'metric':'bad'},expected=400)
    request('/analyzer/utility/search',query | {'type':'bad'},expected=400)
    request('/analyzer/utility/search',query | {'scopes':[{'capture':'bad','rounds':[1]}]},expected=400)
    sql(f"DELETE FROM replay_utility_index_state WHERE capture_id='{capture}'; DELETE FROM replay_utility_events WHERE capture_id='{capture}'")
    with ThreadPoolExecutor(max_workers=2) as pool:
        cold = list(pool.map(lambda _: request('/analyzer/utility/search',query,auth=False), range(2)))
    assert cold[0] == cold[1]
    prepared = cold[0]
    assert prepared['pending_captures'] == [] and prepared['total'] == 1
    assert prepared['rows'][0]['enemy_damage'] == 40
    assert sql(f"SELECT COUNT(*) FROM replay_utility_index_state WHERE capture_id='{capture}' AND version=1") == '1'
    request('/analyzer/utility/index',{'capture':capture},auth=False,expected=401)
    request('/analyzer/utility/index',{'capture':capture})
    request('/analyzer/utility/index',{'capture':capture})
    assert request('/analyzer/utility/search',query)['total'] == 1
    request(f'/analyzer/captures/{capture}/rounds/1/parts/0', {'data':'bad'},method='PUT',expected=409)
    assert sql("SELECT CONCAT(played_at,'|',played_at_source) FROM matches WHERE id=1") == '2026-11-01 12:00:00|faceit_history'
    assert sql("SELECT state FROM account_manual_filter_states WHERE filter_id='tag' AND match_id=1") == 'true'
    # A failed new capture must leave the published one usable.
    newer = request('/analyzer/matches/1/captures',upload)['capture']
    request('/analyzer/captures/'+newer+'/complete',method='POST',expected=409)
    assert request('/analyzer/matches?match=1')['matches'][0]['capture'] == capture
    # Cross the 100-event insert batch boundary, then prove lazy rebuilding is
    # identical to atomic publication, including stable event numbers/paging.
    rounds[0]['utility'] = [grenade('HE',40) for _ in range(205)]
    rounds[1]['utility'] = []
    text = [json.dumps(r,separators=(',', ':')) for r in rounds]
    for item,t in zip(manifest,text):
        item['bytes'] = len(t.encode())
        item['sha256'] = hashlib.sha256(t.encode()).hexdigest()
    bulk = request('/analyzer/matches/1/captures',upload)['capture']
    # Publication order is deterministic even if both test captures were created
    # in the same timestamp second (production breaks ties by UUID).
    sql(f"UPDATE replay_captures SET created_at=NOW()+INTERVAL 1 MINUTE WHERE id='{bulk}'")
    for i,t in enumerate(text,1):
        cut = len(t)//2
        for part,value in enumerate([t[:cut],t[cut:]]):
            request(f'/analyzer/captures/{bulk}/rounds/{i}/parts/{part}',{'data':value},method='PUT',expected=204)
    request('/analyzer/captures/'+bulk+'/complete',method='POST',expected=204)
    bulk_query = query | {'scopes':[{'capture':bulk,'rounds':[1,2]}],'limit':100}
    published = request('/analyzer/utility/search',bulk_query)
    assert published['total'] == 205 and len(published['rows']) == 100
    assert [r['event'] for r in published['rows']] == list(range(100))
    sql(f"DELETE FROM replay_utility_index_state WHERE capture_id='{bulk}'")
    rebuilt = request('/analyzer/utility/search',bulk_query,auth=False)
    assert rebuilt == published
    last = request('/analyzer/utility/search',bulk_query | {'offset':200})
    assert [r['event'] for r in last['rows']] == list(range(200,205))
    sql("UPDATE matches SET demo_sha256=UNHEX(REPEAT('b',64)) WHERE id=1")
    assert request('/analyzer/matches?match=1')['matches'][0].get('capture') is None
    request('/analyzer/captures/'+capture,expected=404)
    request('/analyzer/utility/search',query,expected=409)
    # Independent round-condition summaries: full-round totals, disjoint
    # opening cohorts, and unknown legacy rounds must never become no-attempt.
    request('/players/99999/round-conditions',auth=False,expected=404)
    sql("INSERT INTO player_side_stats(match_player_id,side,rounds_played) VALUES(1,'CT',2)")
    assert request('/players/1/round-conditions',auth=False)['matches'][0]['covered_rounds'] == 0
    base = {'rounds':[1,1],'kda':[3,0,1,1,250],'kast_rounds':1,'opening':[1,0],
            'trade_kills':0,'trade_d':[0,0,0],'utility':[0,0],'speed':[0,0,None,0,0,None]*2,
            'clutches':[0]*5,'kill_rounds':[0,0,1,0,0],'weapons':[['ak47',3,10,250,1,5]],
            'duels':[],'trades':[],'contexts':[],'assisted_by':[],'flashes':[]}
    second = base | {'rounds':[1,0],'kda':[0,1,0,0,20],'kast_rounds':0,'opening':[0,1],'weapons':[]}
    for number,value in [(1,base),(2,second)]:
        text=json.dumps(value,separators=(',', ':')).replace("'","''")
        sql(f"UPDATE player_round_phase_stats SET stats_json='{text}',buy_type='full',opponent_buy_type='eco' WHERE match_player_id=1 AND round_number={number}")
    cohorts = request('/players/1/round-conditions',auth=False)['matches'][0]
    assert cohorts['expected_rounds'] == cohorts['covered_rounds'] == 2
    assert {r['condition'] for r in cohorts['slices']} == {'opening_kill','opening_death'}
    kill = next(r for r in cohorts['slices'] if r['condition']=='opening_kill')
    assert kill['rounds'] == [1] and kill['stats']['kills'] == 3 and kill['stats']['damage'] == 250
    assert kill['buy_type']=='full' and kill['opponent_buy_type']=='eco'
    second['opening']=[0,0]
    text=json.dumps(second,separators=(',', ':')).replace("'","''")
    sql(f"UPDATE player_round_phase_stats SET stats_json='{text}' WHERE match_player_id=1 AND round_number=2")
    assert {r['condition'] for r in request('/players/1/round-conditions',auth=False)['matches'][0]['slices']} == {'opening_kill','no_opening'}
    # Trade filters use the selected player's round in both directions. The
    # five-match teammate threshold is global, not limited to this request.
    sql("INSERT INTO players(id,steam_id,current_name) VALUES(4,4,'Four')")
    sql("INSERT INTO match_players(match_id,match_team_id,player_slot,player_id,display_name) VALUES(1,1,3,4,'Four')")
    for match in range(2,6):
        sql(f"""
          INSERT INTO matches(id,demo_sha256,payload_schema,nickstats_build,parser_name,parser_version,parser_config_id,map_name,rounds)
          VALUES({match},UNHEX(LPAD(HEX({match}),64,'0')),'nickstats.match/27','integration','test','1',1,'de_mirage',2);
          INSERT INTO match_teams(id,match_id,team_slot,source_team_id,display_name) VALUES({match*10},{match},0,'a','A'),({match*10+1},{match},1,'b','B');
          INSERT INTO match_players(match_id,match_team_id,player_slot,player_id,display_name)
          VALUES({match},{match*10},0,1,'One'),({match},{match*10},1,2,'Two'),({match},{match*10+1},2,3,'Three');
        """)
        if match < 5:
            sql(f"INSERT INTO match_players(match_id,match_team_id,player_slot,player_id,display_name) VALUES({match},{match*10},3,4,'Four')")
    def save_trade_round(actor,number,value,buy,enemy,result,side='CT'):
        text=json.dumps(value,separators=(',', ':')).replace("'","''")
        sql(f"""INSERT INTO player_round_phase_stats(match_id,match_player_id,round_number,side,buy_type,opponent_buy_type,round_result,stats_json)
          VALUES(1,{actor},{number},'{side}','{buy}','{enemy}','{result}','{text}')
          ON DUPLICATE KEY UPDATE side=VALUES(side),buy_type=VALUES(buy_type),opponent_buy_type=VALUES(opponent_buy_type),round_result=VALUES(round_result),stats_json=VALUES(stats_json)""")
    save_trade_round(1,1,base | {'trades':[[1,10,7,5],[2,90,80,70],[3,90,80,70]]},'full','eco','win')
    save_trade_round(1,2,second | {'trades':[[1,4,2,1]]},'pistol','pistol','loss')
    save_trade_round(1,25,base | {'opening':[0,1],'hero':True,'trades':[[1,2,1,0]]},'force','full','loss','T')
    # Deliberately different teammate buys/openings: incoming must still use One.
    save_trade_round(2,1,base | {'opening':[0,1],'trades':[[0,8,6,4]]},'pistol','eco','win')
    save_trade_round(2,2,base | {'trades':[[0,3,2,1]]},'full','pistol','loss')
    save_trade_round(2,25,base | {'trades':[[0,2,1,0]]},'eco','full','loss','T')
    sql("""INSERT INTO trade_side_stats(match_id,trader_match_player_id,teammate_match_player_id,trader_side,opportunities,attempts,successes,opening_successes)
      VALUES(1,1,2,'CT',14,9,6,0),(1,2,1,'CT',11,8,5,0),(1,1,2,'T',2,1,0,0),(1,2,1,'T',2,1,0,0),
            (1,1,3,'CT',90,80,70,0),(1,1,4,'CT',90,80,70,0)""")
    def trades(filters=None, player=1):
        return request(f'/players/{player}/trade-teammates',{'match_ids':[1,1],'side':'ALL',**(filters or {})},auth=False)
    def assert_trades(filters,outgoing,incoming):
        result=trades(filters)
        assert [r['id'] for r in result['outgoing']] == [2], (filters,result)
        assert [r['id'] for r in result['incoming']] == [2], (filters,result)
        for direction,counts in [('outgoing',outgoing),('incoming',incoming)]:
            assert [result[direction][0][k] for k in ['opportunities','attempts','trades']] == counts,(filters,result)
    assert_trades({},[16,10,6],[13,9,5])
    assert_trades({'side':'CT'},[14,9,6],[11,8,5])
    assert_trades({'buy':'full'},[10,7,5],[8,6,4])
    assert_trades({'buy':'pistol'},[4,2,1],[3,2,1])
    assert_trades({'buy':'hero'},[2,1,0],[2,1,0])
    assert_trades({'opponent_buy':'full'},[2,1,0],[2,1,0])
    assert_trades({'round_result':'loss'},[6,3,1],[5,3,1])
    assert_trades({'round_phase':'REGULATION'},[14,9,6],[11,8,5])
    assert_trades({'round_phase':'OVERTIME','side':'T'},[2,1,0],[2,1,0])
    assert_trades({'round_condition':'opening_kill'},[10,7,5],[8,6,4])
    assert_trades({'round_condition':'opening_death'},[2,1,0],[2,1,0])
    assert_trades({'round_condition':'opening_attempt'},[12,8,5],[10,7,4])
    assert_trades({'round_condition':'no_opening'},[4,2,1],[3,2,1])
    assert_trades({'buy':'full','opponent_buy':'eco','round_result':'win','side':'CT','round_phase':'REGULATION','round_condition':'opening_kill'},[10,7,5],[8,6,4])
    assert trades({'buy':'pistol','side':'T'}) == {'outgoing':[],'incoming':[]}
    # Publicly inspect another profile, and exclude four-game friends/opponents.
    assert [r['id'] for r in trades(player=2)['outgoing']] == [1]
    assert trades(player=3) == {'outgoing':[],'incoming':[]}
    sql("UPDATE player_round_phase_stats SET stats_json=JSON_REMOVE(stats_json,'$.opening') WHERE match_player_id=1 AND round_number=2")
    assert trades({'round_condition':'no_opening'}) == {'outgoing':[],'incoming':[]}
    for key in ['buy','opponent_buy','round_result','round_phase','round_condition']:
        request('/players/1/trade-teammates',{'match_ids':[1],'side':'ALL',key:'bad'},auth=False,expected=400)
    print('Trade integration passed: recurring teammates, both directions, all round filters, intersections, public profiles, legacy unknowns.')
    print('Analyzer integration passed: auth, rosters, chunk checksums, atomic publication, projection, date/tag preservation, stale fingerprints.')
finally:
    server.terminate()
    server.wait(timeout=10)
