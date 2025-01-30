# Move to the backend directory
cd back\

# Make sure you have python 3.11 installed
if (-not (python --version) -match "3.11") {
    Write-Host "Please install python 3.11"
    exit 1
}

# Make sure the build directory exists
if (-not (Test-Path "build")) {
    New-Item -ItemType Directory -Name "build"
}

if (-not (Test-Path "build\.venv")) {
    # Create a virtual environment if it doesn't exist
    python -m venv build\.venv
}

build\.venv\Scripts\pip install -U pip setuptools wheel

build\.venv\Scripts\pip install pyinstaller

# Install sonari
build\.venv\Scripts\pip install .

# Run pyinstaller to bundle sonari into an executable file
build\.venv\Scripts\pyinstaller `
    --hidden-import "app" `
    --hidden-import "aiosqlite" `
    --hidden-import "logging.config" `
    --hidden-import "colorama" `
    --hidden-import "passlib.handlers.bcrypt" `
    --hidden-import "rasterio" `
	--hidden-import "rasterio.sample" `
    --hidden-import "rasterio._shim" `
    --hidden-import "rasterio.control" `
    --hidden-import "rasterio.crs" `
    --hidden-import "rasterio.vrt" `
    --hidden-import "rasterio._features" `
    --add-data "src\sonari\migrations;sonari\migrations" `
    --add-data "src\sonari\statics;sonari\statics" `
    --add-data "src\sonari\user_guide;sonari\user_guide" `
    --add-data "alembic.ini;." `
    --recursive-copy-metadata "numpy" `
    --name sonari `
    --onefile `
    --console `
    app.py


# Zip the executable file 
Compress-Archive -Path "dist\sonari.exe" -DestinationPath "dist\sonari.zip"
