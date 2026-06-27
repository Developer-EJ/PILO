#!/bin/sh
set -e

awslocal sqs create-queue --queue-name pilo-agent-jobs >/dev/null
awslocal sqs create-queue --queue-name pilo-agent-results >/dev/null

