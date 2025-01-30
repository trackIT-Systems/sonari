# Sonari - Python Backend

**sonari** is an open-source web-based audio annotation tool designed to
facilitate audio data labeling and annotation, with a special focus on aiding
machine learning model development.

For additional details on installing the entire application and its usage, refer
to the main [README](https://github.com/mbsantiago/sonari).

For the latest updates and detailed documentation, check out the official
[documentation](https://mbsantiago.github.io/sonari/).

## Installation

### With Pip

The most straightforward method to set up the backend and Sonari Python API is
using pip. Execute the following command:

```bash
pip install sonari
```

### From Source Code

Clone the repository:

```bash
git clone https://github.com/mbsantiago/sonari.git
```

Install the package:

```bash
cd sonari/backend
pip install .
```

### With Docker

Run Sonari inside a Docker container. Build the container by cloning the repository and executing:


```bash
git clone https://github.com/mbsantiago/sonari.git
docker build -t sonari .
```

Once the build is complete, run the container with:

```bash
docker run -p 5000:5000 sonari
```

### Development Environment

We manage Sonari's development with `rye`. 

1. Follow the official [installation instructions](https://rye-up.com/guide/installation/) to get `rye` on your machine.

2. Clone the repository:

```bash
git clone https://github.com/mbsantiago/sonari.git
```

3. Navigate to the backend directory and install dependencies:

```bash
cd sonari/back
rye sync
```

4. Start the development server:

```bash
make serve-dev
```

or

```bash
SONARI_DEV=true rye run python -m sonari
```
