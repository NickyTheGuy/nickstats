FROM swift:6.3-noble AS build

RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get -q update \
    && apt-get -q install -y libjemalloc-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY Package.swift ./
RUN swift package resolve
COPY Sources ./Sources
COPY Tests ./Tests
RUN swift build -c release --product NickStatsAPI --static-swift-stdlib -Xlinker -ljemalloc \
    && cp "$(swift build -c release --show-bin-path)/NickStatsAPI" /usr/local/bin/NickStatsAPI

FROM ubuntu:noble

RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get -q update \
    && apt-get -q install -y libjemalloc2 ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --user-group --create-home --system --home-dir /app vapor

WORKDIR /app
COPY --from=build --chown=vapor:vapor /usr/local/bin/NickStatsAPI ./NickStatsAPI
USER vapor:vapor

EXPOSE 8000
ENTRYPOINT ["./NickStatsAPI"]
CMD ["serve", "--env", "production", "--hostname", "0.0.0.0", "--port", "8000"]
