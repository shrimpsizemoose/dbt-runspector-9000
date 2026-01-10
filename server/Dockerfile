FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY main.go template.html ./

ARG VERSION=dev
ARG GIT_SHA=unknown

RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o server .

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/server .

ARG VERSION=dev
ARG GIT_SHA=unknown

ENV HOST=0.0.0.0
ENV PORT=8765
ENV VERSION=${VERSION}
ENV GIT_SHA=${GIT_SHA}

EXPOSE 8765

CMD ["./server"]
