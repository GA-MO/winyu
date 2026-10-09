LISTEN := 3100 3290
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
	@for port in $(LISTEN); do \
		pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN); \
		[ -n "$$pids" ] && kill $$pids && echo "stopped :$$port ($$pids)"; \
	done; true

status:
	@listening=$$(lsof -nP $(foreach port,$(LISTEN),-iTCP:$(port)) -sTCP:LISTEN); \
	[ -n "$$listening" ] && echo "$$listening" || echo "nothing listening on $(LISTEN)"
