package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestRun(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		want string
	}{
		{name: "skeleton message", want: "calc backend skeleton"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var out bytes.Buffer
			if err := run(&out); err != nil {
				t.Fatalf("run() error = %v", err)
			}

			if got := strings.TrimSpace(out.String()); got != tc.want {
				t.Errorf("run() output = %q, want %q", got, tc.want)
			}
		})
	}
}
