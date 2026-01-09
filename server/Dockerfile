FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:stable

RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*

ARG VERSION=dev
ARG GIT_SHA=unknown

WORKDIR /app

COPY server.py template.html ./

ENV HOST=0.0.0.0
ENV PORT=8765
ENV VERSION=${VERSION}
ENV GIT_SHA=${GIT_SHA}

EXPOSE 8765

CMD ["python3", "server.py"]
