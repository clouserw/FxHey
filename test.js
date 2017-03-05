/* eslint-env mocha */

'use strict'

const { assert } = require('chai')
const pkg = require('./package.json')

suite('unit tests:', () => {
  const sinon = require('sinon')
  const proxyquire = require('proxyquire')
  const interval = 'foo'
  const version = {
    commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e',
    source: 'git://github.com/mozilla/fxa-content-server.git'
  }
  let timers, got, fxoi

  setup(() => {
    timers = {
      setInterval: sinon.spy(() => interval),
      clearInterval: sinon.spy()
    }
    // proxyquire barfs if got is a spied-on arrow function :-/
    got = sinon.spy(function () { return Promise.resolve({ body: version }) })
    fxoi = proxyquire('.', { timers, got })
  })

  test('interface is correct', () => {
    assert.isFunction(fxoi)
    assert.lengthOf(fxoi, 1)
  })

  test('timers were not invoked', () => {
    assert.equal(timers.setInterval.callCount, 0)
    assert.equal(timers.clearInterval.callCount, 0)
  })

  test('throws if rate is less than every half an hour', () => {
    assert.throws(() => fxoi(() => {}, { rate: 1799999 }))
  })

  test('does not throw if rate is every half an hour', () => {
    assert.doesNotThrow(() => fxoi(() => {}, { rate: 1800000 }))
  })

  test('throws if user agent is the empty string', () => {
    assert.throws(() => fxoi(() => {}, { userAgent: '' }))
  })

  test('does not throw if user agent is a non-empty string', () => {
    assert.doesNotThrow(() => fxoi(() => {}, { userAgent: 'wibble' }))
  })

  test('throws if initial train is zero', () => {
    assert.throws(() => fxoi(() => {}, {
      status: {
        train: 0,
        time: Date.now(),
        versions: [
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('throws if initial time is zero', () => {
    assert.throws(() => fxoi(() => {}, {
      status: {
        train: 81,
        time: 0,
        versions: [
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('throws if initial versions has length three', () => {
    assert.throws(() => fxoi(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('throws if version train is zero', () => {
    assert.throws(() => fxoi(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 0, patch: 0 }
        ]
      }
    }))
  })

  test('throws if version train is greater than initial train', () => {
    assert.throws(() => fxoi(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 82, patch: 0 },
          { train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('throws if version patch is negative', () => {
    assert.throws(() => fxoi(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { train: 81, patch: 0 },
          { train: 81, patch: -1 },
          { train: 81, patch: 0 },
          { train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('does not throw if initial status is valid', () => {
    assert.doesNotThrow(() => fxoi(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 81, patch: 0 },
          { train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('does not throw without options', () => {
    assert.doesNotThrow(() => fxoi(() => {}))
  })

  test('throws if callback is not a function', () => {
    assert.throws(() => fxoi({}))
  })

  suite('fxoi with patch difference:', () => {
    let now, afterCallback, callback, cancel

    setup(done => {
      now = Date.now()
      sinon.stub(Date, 'now', () => now)
      afterCallback = done
      callback = sinon.spy(() => afterCallback())
      version.version = '0.81.1'
      cancel = fxoi(callback, {
        status: {
          train: 81,
          time: now - 1,
          versions: [
            { train: 81, patch: 0 },
            { train: 81, patch: 0 },
            { train: 81, patch: 0 },
            { train: 81, patch: 0 }
          ]
        }
      })
    })

    teardown(() => {
      Date.now.restore()
    })

    test('returned function', () => {
      assert.isFunction(cancel)
      assert.lengthOf(cancel, 0)
    })

    test('called got correctly', () => {
      assert.equal(got.callCount, 4)
      let args = got.args[0]
      assert.lengthOf(args, 2)
      assert.equal(args[0], 'https://accounts.firefox.com/ver.json')
      assert.deepEqual(args[1], {
        json: true,
        headers: {
          'User-Agent': `FxOi/${pkg.version} (https://github.com/philbooth/fxoi)`
        }
      })
      assert.equal(got.args[1][0], 'https://api.accounts.firefox.com/__version__')
      assert.equal(got.args[2][0], 'https://profile.accounts.firefox.com/__version__')
      assert.equal(got.args[3][0], 'https://oauth.accounts.firefox.com/__version__')
    })

    test('called callback correctly', () => {
      assert.equal(callback.callCount, 1)
      const args = callback.args[0]
      assert.lengthOf(args, 2)
      assert.isNull(args[0])
      assert.deepEqual(args[1], {
        time: now,
        train: 81,
        diffs: [
          { name: 'content', current: { train: 81, patch: 1 }, previous: { train: 81, patch: 0 } },
          { name: 'auth', current: { train: 81, patch: 1 }, previous: { train: 81, patch: 0 } },
          { name: 'profile', current: { train: 81, patch: 1 }, previous: { train: 81, patch: 0 } },
          { name: 'oauth', current: { train: 81, patch: 1 }, previous: { train: 81, patch: 0 } }
        ],
        patches: [
          { name: 'content', train: 81, patch: 1 },
          { name: 'auth', train: 81, patch: 1 },
          { name: 'profile', train: 81, patch: 1 },
          { name: 'oauth', train: 81, patch: 1 }
        ],
        versions: [
          { name: 'content', train: 81, patch: 1, tag: 'v0.81.1', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' },
          { name: 'auth', train: 81, patch: 1, tag: 'v0.81.1', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' },
          { name: 'profile', train: 81, patch: 1, tag: 'v0.81.1', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' },
          { name: 'oauth', train: 81, patch: 1, tag: 'v0.81.1', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' }
        ]
      })
    })

    test('called setInterval correctly', () => {
      assert.equal(timers.setInterval.callCount, 1)
      const args = timers.setInterval.args[0]
      assert.lengthOf(args, 2)
      assert.isFunction(args[0])
      assert.notEqual(args[0], callback)
      assert.equal(args[1], 3600000)
    })

    test('did not call clearInterval', () => {
      assert.equal(timers.clearInterval.callCount, 0)
    })

    suite('after interval without difference:', () => {
      setup(() => {
        afterCallback = () => {}
        timers.setInterval.args[0][0]()
      })

      test('called got four more times', () => {
        assert.equal(got.callCount, 8)
      })

      test('did not call callback', () => {
        assert.equal(callback.callCount, 1)
      })
    })

    suite('after interval with difference:', () => {
      setup(done => {
        afterCallback = done
        version.version = '0.81.2'
        timers.setInterval.args[0][0]()
      })

      test('called got four more times', () => {
        assert.equal(got.callCount, 8)
      })

      test('called callback correctly', () => {
        assert.equal(callback.callCount, 2)
        assert.notEqual(callback.args[1][1], callback.args[0][1])
        assert.deepEqual(callback.args[1][1], {
          time: now,
          train: 81,
          diffs: [
            { name: 'content', current: { train: 81, patch: 2 }, previous: { train: 81, patch: 1 } },
            { name: 'auth', current: { train: 81, patch: 2 }, previous: { train: 81, patch: 1 } },
            { name: 'profile', current: { train: 81, patch: 2 }, previous: { train: 81, patch: 1 } },
            { name: 'oauth', current: { train: 81, patch: 2 }, previous: { train: 81, patch: 1 } }
          ],
          patches: [
            { name: 'content', train: 81, patch: 2 },
            { name: 'auth', train: 81, patch: 2 },
            { name: 'profile', train: 81, patch: 2 },
            { name: 'oauth', train: 81, patch: 2 }
          ],
          versions: [
            { name: 'content', train: 81, patch: 2, tag: 'v0.81.2', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' },
            { name: 'auth', train: 81, patch: 2, tag: 'v0.81.2', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' },
            { name: 'profile', train: 81, patch: 2, tag: 'v0.81.2', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' },
            { name: 'oauth', train: 81, patch: 2, tag: 'v0.81.2', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' }
          ]
        })
      })
    })

    suite('cancel:', () => {
      setup(() => {
        cancel()
      })

      test('called clearInterval correctly', () => {
        assert.equal(timers.clearInterval.callCount, 1)
        const args = timers.clearInterval.args[0]
        assert.lengthOf(args, 1)
        assert.equal(args[0], interval)
      })
    })
  })

  suite('fxoi with version difference:', () => {
    let now, callback, cancel

    setup(done => {
      now = Date.now()
      sinon.stub(Date, 'now', () => now)
      callback = sinon.spy(done)
      version.version = '1.82.0'
      cancel = fxoi(callback, {
        status: {
          train: 81,
          time: now - 1,
          versions: [
            { train: 81, patch: 0 },
            { train: 81, patch: 0 },
            { train: 81, patch: 0 },
            { train: 81, patch: 0 }
          ]
        }
      })
    })

    teardown(() => {
      Date.now.restore()
    })

    test('called callback correctly', () => {
      assert.equal(callback.callCount, 1)
      assert.deepEqual(callback.args[0][1], {
        time: now,
        train: 82,
        diffs: [
          { name: 'content', current: { train: 82, patch: 0 }, previous: { train: 81, patch: 0 } },
          { name: 'auth', current: { train: 82, patch: 0 }, previous: { train: 81, patch: 0 } },
          { name: 'profile', current: { train: 82, patch: 0 }, previous: { train: 81, patch: 0 } },
          { name: 'oauth', current: { train: 82, patch: 0 }, previous: { train: 81, patch: 0 } }
        ],
        patches: [],
        versions: [
          { name: 'content', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' },
          { name: 'auth', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' },
          { name: 'profile', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' },
          { name: 'oauth', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'git://github.com/mozilla/fxa-content-server.git' }
        ]
      })
    })
  })

  suite('fxoi with no differences:', () => {
    let now, callback, cancel

    setup(() => {
      now = Date.now()
      sinon.stub(Date, 'now', () => now)
      callback = sinon.spy()
      version.version = '1.81.0'
      cancel = fxoi(callback, {
        status: {
          train: 81,
          time: now - 1,
          versions: [
            { train: 81, patch: 0 },
            { train: 81, patch: 0 },
            { train: 81, patch: 0 },
            { train: 81, patch: 0 }
          ]
        }
      })
    })

    teardown(() => {
      Date.now.restore()
    })

    test('called got four times', () => {
      assert.equal(got.callCount, 4)
    })

    test('did not call callback', () => {
      assert.equal(callback.callCount, 0)
    })
  })
})

suite('functional test:', () => {
  let now, cancel, error, result

  setup(done => {
    now = Date.now()
    cancel = require('.')((e, r) => {
      error = e
      result = r
      done()
    }, {
      status: {
        time: Date.UTC(2017, 0, 1),
        train: 80,
        versions: [
          { train: 80, patch: 0 },
          { train: 80, patch: 0 },
          { train: 80, patch: 0 },
          { train: 80, patch: 0 }
        ]
      }
    })
  })

  teardown(() => {
    cancel()
  })

  test('result seems correct', () => {
    assert.isNull(error)
    assert.isObject(result)
    assert.isNumber(result.train)
    assert.isAtLeast(result.train, 81)
    assert.isNumber(result.time)
    assert.isAtLeast(result.time, now)
    assert.isArray(result.diffs)
    assert.isArray(result.patches)
    assert.isArray(result.versions)
    assert.lengthOf(result.versions, 4)
    let patchCount = 0
    result.versions.forEach(version => {
      assert.isNumber(version.train)
      assert.isAtMost(version.train, result.train)
      assert.isNumber(version.patch)
      assert.isAtLeast(version.patch, 0)
      if (version.patch > 0) {
        ++patchCount
      }
      assert.match(version.tag, new RegExp(`^v[01]\\.${version.train}\\.${version.patch}$`))
      assert.match(version.commit, /^[a-f0-9]{40}$/)
    })
    assert.lengthOf(result.patches, patchCount)
    assert.equal(result.versions[0].name, 'content')
    assert.equal(result.versions[0].repo, 'git://github.com/mozilla/fxa-content-server.git')
    assert.equal(result.versions[1].name, 'auth')
    assert.equal(result.versions[1].repo, 'git@github.com:mozilla/fxa-auth-server-private.git')
    assert.equal(result.versions[2].name, 'profile')
    assert.equal(result.versions[2].repo, 'https://github.com/mozilla/fxa-profile-server')
    assert.equal(result.versions[3].name, 'oauth')
    assert.equal(result.versions[3].repo, 'git://github.com/mozilla/fxa-oauth-server.git')
  })
})

