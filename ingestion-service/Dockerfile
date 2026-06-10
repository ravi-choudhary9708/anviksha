FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy go mod and source code
COPY go.mod main.go ./

# Add missing modules and generate go.sum
RUN go mod tidy

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o ingestion-service .

FROM alpine:latest

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/ingestion-service .

EXPOSE 8080

CMD ["./ingestion-service"]
