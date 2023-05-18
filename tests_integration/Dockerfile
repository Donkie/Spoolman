FROM python:3.11-alpine

COPY requirements.txt /tester/

WORKDIR /tester

RUN pip install -r requirements.txt

ENTRYPOINT [ "pytest", "tests" ]
