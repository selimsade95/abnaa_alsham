import csv
import io
import re

from fastapi import HTTPException, UploadFile


async def _read_csv_rows(file: UploadFile):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "يجب أن يكون الملف بصيغة CSV وبترميز UTF-8")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";"
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    rows = []
    for row in reader:
        normalized = {}
        for key, value in row.items():
            base_key = re.split(r"\s*[\[(]", key or "", maxsplit=1)[0].strip()
            normalized[base_key] = value
        rows.append(normalized)
    return rows
