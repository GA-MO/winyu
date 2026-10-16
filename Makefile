LISTEN := 3100 3290
DEMO := docker compose -f deploy/compose.yaml
SCHEDULER ?= off

.PHONY: up dev connectors stop status demo-snapshot demo-build demo-start demo-stop demo-logs demo-reset

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

demo-snapshot:
	bun run scripts/deploy-snapshot.ts

demo-build: demo-snapshot
	$(DEMO) build app

demo-start:
	$(DEMO) up -d app
	@echo "winyu-demo on http://localhost:3100 (sign-in needs HTTPS in front; see docs/plans/demo-deploy.md)"

demo-stop:
	$(DEMO) stop app

demo-logs:
	$(DEMO) logs -f app

demo-reset:
	deploy/reset-demo.sh
