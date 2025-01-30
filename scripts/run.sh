#!/bin/bash
# Description: Run sonari

echo "Starting sonari..."

# Move to the root directory of the backend
cd back

# Run sonari. This assumes that sonari is already installed
python -m sonari >sonari.log 2>&1 &
serverPID=$!

# Wait for up to 8 seconds for the service to be ready.
for attempt in $(seq 1 8); do
	sleep 1
	if grep -q "Application startup complete" sonari.log; then
		echo "start up complete."
		break
	fi
	if [[ attempt -eq 5 ]]; then
		echo "Error launching sonari - see 'sonari.log' for command output."
		exit
	fi
done

xdg-open http://localhost:5000

tail -f sonari.log
