package main

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"agner/dev/calc/internal/calculator"
)

func TestNewServerServesHealthAndCalculate(t *testing.T) {
	t.Parallel()

	server := newServer(defaultAddr, calculator.NewService())
	if server.Addr != defaultAddr {
		t.Errorf("server address = %q, want %q", server.Addr, defaultAddr)
	}

	health := httptest.NewRecorder()
	server.Handler.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if health.Code != http.StatusOK {
		t.Fatalf("GET /healthz status = %d, want 200", health.Code)
	}
	if got, want := health.Body.String(), "ok\n"; got != want {
		t.Errorf("GET /healthz body = %q, want %q", got, want)
	}

	calculate := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/calculate", strings.NewReader(`{"operation":"add","operands":[1,2]}`))
	request.Header.Set("Content-Type", "application/json")
	server.Handler.ServeHTTP(calculate, request)
	if calculate.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/calculate status = %d, want 200; body = %q", calculate.Code, calculate.Body.String())
	}
	if got, want := calculate.Body.String(), `{"result":3}`; got != want {
		t.Errorf("POST /api/v1/calculate body = %q, want %q", got, want)
	}
}

func TestRunShutsDownOnCancellation(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if err := run(ctx, "127.0.0.1:0"); err != nil {
		t.Errorf("run() error = %v, want nil", err)
	}
}

func TestRunReturnsBindError(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer func() { _ = listener.Close() }()

	if err := run(context.Background(), listener.Addr().String()); err == nil {
		t.Error("run() error = nil, want a bind error")
	}
}
