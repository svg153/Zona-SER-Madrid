# Imagen para actualizar los datos de Zona SER Madrid
# Misma versión que el runner de GitHub Actions (ubuntu-latest)
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gdal-bin \
        curl \
        unzip \
        jq \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
