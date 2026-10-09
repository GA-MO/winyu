PORTS := 3100 3297 3298 3299
SCHEDULER ?= off
METRICS ?= mcp

.PHONY: up dev connectors metrics stop status

up:
	@trap 'kill 0' INT TERM EXIT; \
	bun run connectors:demo & \
	bun run metrics:mcp & \
	sleep 2; \
	WINYU_SCHEDULER=$(SCHEDULER) WINYU_METRICS=$(METRICS) bun run dev

dev:
	WINYU_SCHEDULER=$(SCHEDULER) bun run dev

connectors:
	bun run connectors:demo

metrics:
	bun run metrics:mcp

stop:
	@for port in $(PORTS); do \
		pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN); \
		[ -n "$$pids" ] && kill $$pids && echo "stopped :$$port ($$pids)"; \
	done; true

status:
	@listening=$$(lsof -nP $(foreach port,$(PORTS),-iTCP:$(port)) -sTCP:LISTEN); \
	[ -n "$$listening" ] && echo "$$listening" || echo "nothing listening on $(PORTS)"
