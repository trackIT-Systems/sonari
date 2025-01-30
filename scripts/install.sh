#!/bin/bash
# Description: Install sonari python dependencies as an editable package

# Make sure you have python 3.11 installed
if [[ ! $(python --version) =~ "3.11" ]]; then
	echo "Please install python 3.11"
	exit 1
fi

# Move to the root directory of the backend
cd back

# Update pip and setuptools
pip install -U pip setuptools wheel

# Install the dependencies and sonari as an editable package
pip install -U -e .

echo "Installation complete. You can now run sonari with the command 'python -m sonari'"
