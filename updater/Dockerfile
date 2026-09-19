FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY internal ./internal
COPY cmd ./cmd

ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
ARG BUILD_TIME=unknown
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags "-s -w -X github.com/VoidInTheShell/xboard-admin/updater/internal/updater.BuildVersionValue=${VERSION} -X github.com/VoidInTheShell/xboard-admin/updater/internal/updater.BuildTimeValue=${BUILD_TIME}" -o /out/xboard-updater ./cmd/xboard-updater

FROM docker:27-cli
COPY --from=build /out/xboard-updater /usr/local/bin/xboard-updater
ENTRYPOINT ["/usr/local/bin/xboard-updater"]
CMD ["updater", "run", "--config", "/etc/xboard-updater/config.json"]
