# This script is used to update the front end of the website

# Move to the root directory of the backend
cd back

# Delete the old static files
if (Test-Path src/sonari/statics/*) {
    Remove-Item -Path src/sonari/statics/* -Recurse -Force
}

# Go to the root directory of the frontend
cd ../front

# Install the dependencies
npm install

# Run the build script
npm run build

# Make sure the statics folder exists
if (-not (Test-Path "../back/src/sonari/statics")) {
    New-Item -Path "../back/src/sonari/statics" -ItemType Directory | Out-Null
}

# Move the static files to the backend
Move-Item -Path out/* -Destination ../back/src/sonari/statics/ -Force

