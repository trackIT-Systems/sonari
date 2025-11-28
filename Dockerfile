# == Build Front End
FROM node:current-alpine AS web_builder
RUN mkdir /statics

WORKDIR /front/

COPY front/ /front/

ARG SONARI_FOLDER
ARG NEXT_PUBLIC_APP_VERSION
# Set as ENV so it's available when next.config.js runs
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
RUN echo NEXT_PUBLIC_SONARI_FOLDER=$SONARI_FOLDER > /front/.env.local
RUN echo NEXT_TELEMETRY_DISABLED=1 >> /front/.env.local

RUN npm install

RUN npm run build

# Prebuild rasterio, so that lateron builts will be quicker
FROM python:3.13-alpine3.22 AS rasterio_builder
RUN apk add \
    gdal-dev \
    python3-dev \
    build-base
RUN pip wheel --no-cache-dir --wheel-dir /wheels rasterio

# == Run the web server
FROM python:3.13-alpine3.22

WORKDIR /back

RUN apk update && apk add \
    libsndfile-dev \
    libffi-dev \
    gdal-dev \
    python3-dev \
    build-base \
    curl

COPY --from=rasterio_builder /wheels /wheels

# Set the working directory to /code
WORKDIR /code

# Install the Python dependencies
COPY /back/requirements.txt /code/requirements.txt
RUN pip install -r requirements.txt
RUN pip install --no-index --find-links /wheels rasterio

# Copy the sonari source code
COPY /back/src /code/src
COPY /back/app.py /code/app.py
COPY /back/pyproject.toml /code/pyproject.toml
COPY /back/alembic.ini /code/alembic.ini
COPY /back/README.md /code/README.md
COPY /back/LICENSE /code/LICENSE

# Copy the frontend statics BEFORE installing the package
COPY --from=web_builder /front/out/ /code/src/sonari/statics/
    
# Install Sonari
RUN pip install --no-deps .

# Create a directory for audio files
RUN mkdir /audio
RUN mkdir /data

VOLUME ["/data"]

# Set the environment variables for the audio directory and the database URL
ENV SONARI_AUDIO_DIR="/audio"
ENV SONARI_DB_URL="sqlite+aiosqlite:////data/sonari.db"
ENV SONARI_DEV="false"
ENV SONARI_HOST="0.0.0.0"
ENV SONARI_PORT="5000"
ENV SONARI_LOG_LEVEL="info"
ENV SONARI_LOG_TO_STDOUT="true"
ENV SONARI_LOG_TO_FILE="false"
ENV SONARI_OPEN_ON_STARTUP="false"
ENV SONARI_DOMAIN="localhost"

# Expose the port for the web server
EXPOSE 5000

# Run the command to start the web server
CMD ["python", "app.py"]
