#!/usr/bin/env python3
import http.server
import socketserver
import os
import sys

port = int(os.environ.get('PORT', 8000))
directory = '/Users/paulo/Documents/SITE NEUROGRAM/ready-to-deploy'

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = http.server.SimpleHTTPRequestHandler.translate_path(self, path)
        relpath = os.path.relpath(path, os.getcwd())
        return os.path.join(directory, relpath)

os.chdir(directory)
with socketserver.TCPServer(("", port), Handler) as httpd:
    print(f"Server running at http://localhost:{port}/", flush=True)
    httpd.serve_forever()
