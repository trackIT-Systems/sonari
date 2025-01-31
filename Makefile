SHELL := /bin/bash

build-frontend:
	bash scripts/update_front.sh

bundle-pyinstaller:
	bash scripts/bundle_linux.sh
