# Sonari - Python Backend

**sonari** is an open-source web-based audio annotation tool designed to
facilitate audio data labeling and annotation, with a special focus on aiding
machine learning model development.

The current version of Sonari is designed to be executed as part of the trackIT Systems backend.
You can get it running without, I guess, but it is not tested.

## Installation
Clone the repository:

```bash
git clone https://github.com/trackIT-Systems/sonari.git
```

Install the package:

```bash
cd sonari/backend
pip install .
```


### Development Environment

We manage Sonari's development with `rye`. 

1. Follow the official [installation instructions](https://rye-up.com/guide/installation/) to get `rye` on your machine.

2. Clone the repository:

```bash
git clone https://github.com/trackIT-Systems/sonari.git
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
