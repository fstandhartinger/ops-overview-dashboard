FROM python:3.12-slim
WORKDIR /app
COPY server.py /app/server.py
COPY static /app/static
RUN useradd --uid 10001 --create-home dashboard && mkdir /data && chown dashboard /data
USER dashboard
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2)"
CMD ["python", "server.py"]
