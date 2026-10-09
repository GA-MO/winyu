PORTS := 3100 3295 3298 3299
SCHEDULER ?= off
CHANNELS ?= off
CHANNELS_SIM := http://localhost:3295
CHANNELS_ENV = $(shell bun scripts/channel-sim-env.ts $(CHANNELS_SIM)) WINYU_PUBLIC_URL=http://localhost:3100

.PHONY: up dev connectors stop status

up:
ifeq ($(CHANNELS),on)
	@trap 'kill 0' INT TERM EXIT; \
	bun run connectors:demo & \
	WINYU_URL=http://localhost:3100 bun run channels:sim & \
	sleep 2; \
	$(CHANNELS_ENV) WINYU_SCHEDULER=$(SCHEDULER) bun run dev
else
	@trap 'kill 0' INT TERM EXIT; \
	bun run connectors:demo & \
	sleep 2; \
	WINYU_SCHEDULER=$(SCHEDULER) bun run dev
endif

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
