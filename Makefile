PORTS := 3100 3298 3299
SCHEDULER ?= off

.PHONY: up dev connectors stop status

up:
	@trap 'kill 0' INT TERM EXIT; \
	bun run connectors:demo & \
	sleep 2; \
	WINYU_SCHEDULER=$(SCHEDULER) bun run dev

dev:
	WINYU_SCHEDULER=$(SCHEDULER) bun run dev

connectors:
	bun run connectors:demo

stop:
	@for port in $(PORTS); do \
		pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN); \
		[ -n "$$pids" ] && kill $$pids && echo "stopped :$$port ($$pids)"; \
	done; true

status:
	@lsof -nP $(foreach port,$(PORTS),-iTCP:$(port)) -sTCP:LISTEN || echo "nothing listening on $(PORTS)"
