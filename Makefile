SHELL := /bin/bash

.PHONY: install install-ci clean build lint test test-watch typecheck format format-check dev ingest db-migrate db-migrate-make ci

install:
	pnpm install

install-ci:
	pnpm install --frozen-lockfile

clean:
	pnpm run clean

build:
	pnpm run build

lint:
	pnpm run lint

test:
	pnpm run test

test-watch:
	pnpm run test:watch

typecheck:
	pnpm run typecheck

format:
	pnpm run format

format-check:
	pnpm run format:check

dev:
	pnpm dev

ingest:
	pnpm ingest:start

db-migrate:
	pnpm run db:migrate

db-migrate-make:
ifndef NAME
	$(error NAME is required, e.g. make db-migrate-make NAME=create_table)
endif
	pnpm run db:migrate:make $(NAME)

ci: install-ci format-check lint typecheck test build
