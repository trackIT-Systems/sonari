#!/bin/bash
# Description: Bundle sonari into an executable file with pyinstaller

# Move to the backend directory
cd back/

# Make sure you have python 3.11 installed
if [[ ! $(python --version) =~ "3.11" ]]; then
	echo "Please install python 3.11"
	exit 1
fi

# Make sure the build directory exists
if [ ! -d "build" ]; then
	mkdir build
fi

if [ ! -d "build/.venv" ]; then
	# Create a virtual environment if it doesn't exist
	python -m venv build/.venv
fi

build/.venv/bin/pip install -U pip setuptools wheel

build/.venv/bin/pip install pyinstaller

# Install sonari
build/.venv/bin/pip install .

# Run pyinstaller to bundle sonari into an executable file
build/.venv/bin/pyinstaller \
	--hidden-import "app" \
	--hidden-import "aiosqlite" \
	--hidden-import "colorama" \
	--hidden-import "logging.config" \
	--hidden-import "passlib.handlers.bcrypt" \
    --hidden-import "rasterio" \
	--hidden-import "rasterio.sample" \
    --hidden-import "rasterio._shim" \
    --hidden-import "rasterio.control" \
    --hidden-import "rasterio.crs" \
    --hidden-import "rasterio.vrt" \
    --hidden-import "rasterio._features" \
	--add-data "src/sonari/migrations:sonari/migrations" \
	--add-data "src/sonari/statics:sonari/statics" \
	--add-data "alembic.ini:." \
	--name sonari \
	--onefile \
	app.py


chmod +x dist/sonari

# Zip the executable file
zip -r dist/sonari.zip dist/sonari
