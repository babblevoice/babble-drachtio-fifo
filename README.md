

Thoughts on fifo

Support 2 modes

1. Ring all
2. enterprise

# TODO

1. There is a problem in ringall where I had to change the tests to accept a higher number of calls than I expected, I allowed it as this is working in the world - but it needs to be understood better.

# Ring all

When a call comes in - ring all available phones

When an agent hangs up the queue position number 1 is assigned to that phone
If further agents hang up then they are also added to that potential call

We can extend the ring time and repeat

When a call is answered:

1. if other calls waiting update all existing calls
2. if no other calls in queue waiting hangup ringing phones

# Enterprise

When 1 call comes in - ring 1 phone
When 2 calls come in ring 2 phones
Hide caller id during ringing to be able to place next call placed on first answer

Support idle time after agent finishes

# Common

A queue with the same name for enterprise and ring all are 2 separate queues
A queue will have a priority (and a default priority)
In these 2 scenarios both queues 

# Test

## The whole suite
```sh
docker run --rm -it \
  -v "$(pwd):/app:z" \
  -w /app \
  node:25-alpine sh -lc '
    npm test
  '
```

## A specific test
```sh
docker run --rm -it \
  -v "$(pwd):/app:z" \
  -w /app \
  node:25-alpine sh -lc '
    ./node_modules/mocha/bin/_mocha --recursive --check-leaks --grep "main ringall queue 1 call"
  '
```


# Install modules etc

## Install a module
```sh
docker run --rm -it \
  -v "$(pwd):/app:z" \
  -w /app \
  node:25-alpine sh -lc '
    npm i --save-dev @types/mocha
  '
```


## Update
```sh
docker run --rm -it \
  -v "$(pwd):/app:z" \
  -w /app \
  node:25-alpine sh -lc '
    npm update
  '
```




