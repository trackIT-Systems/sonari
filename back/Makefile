SHELL := /bin/bash
.PHONY: clean clean-build clean-pyc dist help install lint lint/flake8 lint/black

.DEFAULT_GOAL := help

ENV_PREFIX=.venv/bin/
SONARI_BACKEND_DEV_PORT ?= 5000

define BROWSER_PYSCRIPT
import os, webbrowser, sys

from urllib.request import pathname2url

webbrowser.open("file://" + pathname2url(os.path.abspath(sys.argv[1])))
endef
export BROWSER_PYSCRIPT

define PRINT_HELP_PYSCRIPT
import re, sys

for line in sys.stdin:
	match = re.match(r'^([a-zA-Z_-]+):.*?## (.*)$$', line)
	if match:
		target, help = match.groups()
		print("%-20s %s" % (target, help))
endef
export PRINT_HELP_PYSCRIPT

BROWSER := python -c "$$BROWSER_PYSCRIPT"

help:  ## show this help message and exit
	@python -c "$$PRINT_HELP_PYSCRIPT" < $(MAKEFILE_LIST)

clean: clean-build clean-pyc ## remove all build and Python artifacts

clean-build:
	rm -fr build/
	rm -fr dist/
	rm -fr .eggs/
	find . -name '*.egg-info' -exec rm -fr {} +
	find . -name '*.egg' -exec rm -f {} +

clean-pyc:
	find . -name '*.pyc' -exec rm -f {} +
	find . -name '*.pyo' -exec rm -f {} +
	find . -name '*~' -exec rm -f {} +
	find . -name '__pycache__' -exec rm -fr {} +

lint/ruff:
	$(ENV_PREFIX)ruff check src

lint/pyright:
	$(ENV_PREFIX)pyright src

lint: lint/ruff lint/pyright

format:  ## format code
	$(ENV_PREFIX)ruff format src

install: clean  ## install the package to the active Python's site-packages
	python -m venv .venv
	$(ENV_PREFIX)pip install .

serve-dev:  ## serve development backend
	SONARI_DEV=true $(ENV_PREFIX)python -m sonari
