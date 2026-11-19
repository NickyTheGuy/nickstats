"""HTTP + MySQL integration checks; only runs against the isolated CI database."""
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

def request(path, body=None, method=None, auth=True, expected=200):
    headers = {'Content-Type': 'application/json'}
    if auth:
        headers['Authorization'] = 'Bearer ' + os.environ['NICKSTATS_UPLOAD_TOKEN']
    data = None if body is None else json.dumps(body, separators=(',', ':')).encode()
    req = urllib.request.Request('http://127.0.0.1:8000'+path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status, content = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, content = error.code, error.read()
    assert status == expected, (path, status, content[:500])
    return json.loads(content) if content else None

server = subprocess.Popen([str(root/'backend/.build/debug/NickStatsAPI'), 'serve', '--hostname', '127.0.0.1', '--port', '8000'])
try:
    for attempt in range(60):
        try:
            request('/health')
            break
        except (urllib.error.URLError, AssertionError):
            time.sleep(.5)
    else:
        raise RuntimeError('API did not start')
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
    grenade = enriched['rounds'][0]['performance'][0]['grenades']
    assert grenade['flash_thrown'] == 1 and grenade['enemies_flashed'] == 2 and grenade['fire_damage'] == 80 and grenade['blind_ms'] == 1500
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
    prepared = request('/analyzer/utility/search',query,auth=False)
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
    sql("UPDATE matches SET demo_sha256=UNHEX(REPEAT('b',64)) WHERE id=1")
    assert request('/analyzer/matches?match=1')['matches'][0].get('capture') is None
    request('/analyzer/captures/'+capture,expected=404)
    request('/analyzer/utility/search',query,expected=409)
    print('Analyzer integration passed: auth, rosters, chunk checksums, atomic publication, projection, date/tag preservation, stale fingerprints.')
finally:
    server.terminate()
    server.wait(timeout=10)
