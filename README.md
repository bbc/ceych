# ceych

> Wraps any asynchronous function and provides caching of the result

## Installation

```
npm install --save ceych
```

## Usage

```js
'use strict';

const request = require('request');
const Catbox = require('@hapi/catbox').Client;
const Redis = require('@hapi/catbox-redis');

const ceych = require('ceych').createClient({
  cacheClient: new Catbox(new Redis({
    port: 6379,
    host: '127.0.0.1',
    partition: 'cache'
  })),
  defaultTTL: 30
});

function loadData(cb) {
  request.get('https://www.big-data.com/datum.csv', cb);
}

const loadDataCached = ceych.wrap(loadData);

const miss = loadDataCached(); // returned from the server and stored in the cache
const hit = loadDataCached(); // returned from the server and stored in the cache
```

## How does it work?

Ceych automatically creates cache keys based on the wrapped function's body and the arguments passed. This saves you from having to create a unique cache key every time you want the result of a function to be cached.

Return values and arguments need to be serializable to/from JSON. This means that while strings, numbers and basic objects are supported, objects with custom constructors or prototypes are not.

### StatsD integration

When using a [node-statsd](https://github.com/sivy/node-statsd) client, ceych will increment a counter each time there is a cache hit or miss. The following metrics are sent:

|Metric|Type|Description|
|------|----|-----------|
|ceych.hits|`counter`|Incremented whenever there is a cache hit|
|ceych.misses|`counter`|Incremented whenever there is a cache miss|

## API

#### `Ceych.createClient(opts)`

Creates a ceych client.

##### Parameters

* `cacheClient` - _optional_ - A [Catbox](https://github.com/hapijs/catbox) client (defaults to an in-memory client).
* `defaultTTL` - _optional_ - The default TTL for caching in seconds (default _30_).
* `statsClient` - _optional_ - An instance of the [node-statsd](https://github.com/sivy/node-statsd) client

#### `ceych.wrap(fn, ttl, suffix)`

Returns a wrapped function that implements caching.

##### Parameters

* `fn` - An asynchronous function to be wrapped.
* `ttl` - _optional_ - Overrides the default TTL.
* `suffix` - _optional_ - A string appended to cache keys to differentiate between identical functions.

#### `ceych.disableCache()`

Disables the use of the cache. This can be useful if you want to toggle usage of the cache for operational purposes - e.g. for operational purposes, or unit tests.

#### `ceych.invalidate(fn, args, cb)`

Invalidates the current cache entry for the given function and args combination.
Note: This takes the original function, _not_ the wrapped function.

#### `ceych.enableCache()`

Re-enables the cache client. This can be useful if you want to toggle usage of the cache for operational purposes - e.g. for operational purposes, or unit tests.
