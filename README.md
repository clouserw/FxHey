# FxOi!

[![Package status](https://img.shields.io/npm/v/fxoi.svg?style=flat-square)](https://www.npmjs.com/package/fxoi)
[![Build status](https://img.shields.io/travis/philbooth/fxoi.svg?style=flat-square)](https://travis-ci.org/philbooth/fxoi)
[![License](https://img.shields.io/github/license/philbooth/fxoi.svg?style=flat-square)](https://opensource.org/licenses/MIT)

Live train announcements for [Firefox Accounts](https://accounts.firefox.com/).

* [You what?](#you-what)
* [How do I install it?](#how-do-i-install-it)
* [How do I use it?](#how-do-i-use-it)
  * [How do I load the library?](#how-do-i-load-the-library)
  * [How do I register for announcements?](#how-do-i-register-for-announcements)
  * [How do I cancel future announcements?](how-do-i-cancel-future-announcements)
  * [What options can I specify?](#what-options-can-i-specify)
* [How do I set up the dev environment?](#how-do-i-set-up-the-dev-environment)
* [What license is it released under?](#what-license-is-it-released-under)

## You what?

Even though I'm
a fully paid-up member
of the dev team,
a lot of the time
I forget where we are
in the Firefox Accounts
deployment train cycle.
Sometimes,
this makes me [look like a dick](https://github.com/mozilla/fxa-activity-metrics/issues/57#issuecomment-283642668).

To work round this
(fixing the root cause
seems unrealistic),
I've created a dashboard
to be beamed onto every flat surface
in my immediate vicinity.
This project is the node module
that powers said dashboard.

## How do I install it?

Honestly,
it's not meant for you.

But if you insist:

```
npm i fxoi --save
```

## How do I use it?

### How do I load the library?

Use `require`:

```js
const fxoi = require('fxoi')
```

### How do I register for announcements?

Call `fxoi(callback, options)`,
where `callback` is a function
that will be invoked whenever
the deployed versions have changed:

```js
const cancel = fxoi(status => view.refresh(status))
```

Here,
`status` will be an object
that looks like this:

```js
{
  train: 81,           // The current FxA train number.
  time: 1488582720000, // Estimated deployment time, in milliseconds since the epoch, UTC.
  diffs: [             // Details of which servers have changed since the last announcement.
    { name: 'auth', current: { train: 81, patch: 2 }, previous: { train: 81, patch: 1 } }
  ],
  patches: [           // Details of which servers have been tagged with a patch level.
    { name: 'auth', train: 81, patch: 2 }
  ],
  versions: [          // Full version information for each deployed server.
    { name: 'content', train: 81, patch: 0, tag: 'v1.81.0', repo: 'mozilla/fxa-content-server' },
    { name: 'auth', train: 81, patch: 2, tag: 'v1.81.2', repo: 'mozilla/fxa-auth-server-private' },
    { name: 'profile', train: 79, patch: 0, tag: 'v0.79.0', repo: 'mozilla/fxa-profile-server' },
    { name: 'oauth', train: 81, patch: 0, tag: 'v1.81.0', repo: 'mozilla/fxa-oauth-server' }
  ]
}
```

After registering once,
your callback function will be called
whenever updated version data
is discovered
on the production servers.

### How do I cancel future announcements?

Just call the returned `cancel` function, like so:

```js
cancel()
```

### What options can I specify?

The options object looks like this:

```js
{
  rate: 1800000,       // Frequency, in milliseconds, that the servers will be checked. Defaults to 1 hour.
  immediate: false,    // Indicates whether an immediate callback is desired. Defaults to `true`.
  userAgent: 'Foo/1.0' // The user agent string used to identify requests to the server.
  status: {            // Initial status information used to determine whether the data has changed.
    train: 81,
    time: 1488582720000,
    versions: [
	  { train: 81, patch: 0 },
	  { train: 81, patch: 2 },
	  { train: 79, patch: 0 },
	  { train: 81, patch: 0 }
    ]
  }
}
```

## Is there a change log?

[Yes](CHANGELOG.md).

## How do I set up the dev environment?

To install the dependencies:

```
npm i
```

To run the unit tests:

```
npm t
```

To run a functional test against the production servers:

```
npm run tf
```

To lint the code:

```
npm run lint
```

## What license is it released under?

[MIT](LICENSE).

