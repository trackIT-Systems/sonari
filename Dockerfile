# == Build Front End
FROM node:latest as web_builder

RUN mkdir /statics

WORKDIR /front/

COPY front/ /front/

ARG SONARI_FOLDER
RUN echo NEXT_PUBLIC_SONARI_FOLDER=$SONARI_FOLDER > /front/.env.local
RUN echo NEXT_TELEMETRY_DISABLED=1 >> /front/.env.local

RUN npm install

RUN npm run build

# == Run the web server
FROM python:3.11

WORKDIR back/

# Install libsndfile1
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    build-essential \
    libffi-dev \
    libgdal-dev \
    python3-dev

# Set the working directory to /code
WORKDIR /code

# Copy the current directory contents into the container at /code

# Copy the statics
COPY --from=web_builder /front/out/ /code/src/sonari/statics/

# Install the Python dependencies for sonari
COPY back/requirements.txt /code/requirements.txt
RUN pip install -r requirements.txt

# Copy the sonari source code
COPY back/src /code/src
COPY back/app.py /code/app.py
COPY back/pyproject.toml /code/pyproject.toml
COPY back/alembic.ini /code/alembic.ini
COPY back/README.md /code/README.md
COPY back/LICENSE /code/LICENSE
    
# Install Sonari
RUN pip install --no-deps .

# Create a directory for audio files
RUN mkdir /audio
RUN mkdir /data

VOLUME ["/data"]

# Set the environment variables for the audio directory and the database URL
ENV SONARI_AUDIO_DIR /audio
ENV SONARI_DB_URL "sqlite+aiosqlite:////data/sonari.db"
ENV SONARI_DEV "false"
ENV SONARI_HOST "0.0.0.0"
ENV SONARI_PORT "5000"
ENV SONARI_LOG_LEVEL "info"
ENV SONARI_LOG_TO_STDOUT "true"
ENV SONARI_LOG_TO_FILE "false"
ENV SONARI_OPEN_ON_STARTUP "false"
ENV SONARI_DOMAIN "localhost"

# Expose the port for the web server
EXPOSE 5000

# Run the command to start the web server
CMD ["python", "app.py"]
