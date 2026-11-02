package adapters

import (
	"context"

	"agner/dev/calc/internal/calculator"
)

// Memory is an in-memory calculator test double. It records requests and
// returns a configured result or error.
type Memory struct {
	Result   calculator.Result
	Err      error
	Requests []calculator.Request
}

// Calculate records the request and returns the configured outcome.
func (m *Memory) Calculate(_ context.Context, request calculator.Request) (calculator.Result, error) {
	m.Requests = append(m.Requests, request)
	if m.Err != nil {
		return calculator.Result{}, m.Err
	}
	return m.Result, nil
}

var _ Calculator = (*Memory)(nil)
