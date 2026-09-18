#!/usr/bin/env sh
set -eu

trap 'kill 0' INT TERM EXIT

npm --prefix server run dev &
npm --prefix client run dev &

wait
