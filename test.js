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
    source: 'git://github.com/mozilla/fxa.git'
  }
  let timers, got, fxhey

  setup(() => {
    timers = {
      setInterval: sinon.spy(() => interval),
      clearInterval: sinon.spy()
    }
    // proxyquire barfs if got is a spied-on arrow function :-/
    // eslint-disable-next-line prefer-arrow-callback, brace-style
    got = sinon.spy(function () { return Promise.resolve({ body: version }) })
    fxhey = proxyquire('.', { timers, got })
  })

  test('interface is correct', () => {
    assert.isFunction(fxhey)
    assert.lengthOf(fxhey, 1)
  })

  test('timers were not invoked', () => {
    assert.equal(timers.setInterval.callCount, 0)
    assert.equal(timers.clearInterval.callCount, 0)
  })

  test('throws if rate is less than every half an hour', () => {
    assert.throws(() => fxhey(() => {}, { rate: 1799999 }))
  })

  test('does not throw if rate is every half an hour', () => {
    assert.doesNotThrow(() => fxhey(() => {}, { rate: 1800000 }))
  })

  test('throws if user agent is the empty string', () => {
    assert.throws(() => fxhey(() => {}, { userAgent: '' }))
  })

  test('does not throw if user agent is a non-empty string', () => {
    assert.doesNotThrow(() => fxhey(() => {}, { userAgent: 'wibble' }))
  })

  test('throws if initial train is zero', () => {
    assert.throws(() => fxhey(() => {}, {
      status: {
        train: 0,
        time: Date.now(),
        versions: [
          { name: 'content', train: 81, patch: 0 },
          { name: 'auth', train: 81, patch: 0 },
          { name: 'profile', train: 81, patch: 0 },
          { name: 'oauth', train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('throws if initial time is zero', () => {
    assert.throws(() => fxhey(() => {}, {
      status: {
        train: 81,
        time: 0,
        versions: [
          { name: 'content', train: 81, patch: 0 },
          { name: 'auth', train: 81, patch: 0 },
          { name: 'profile', train: 81, patch: 0 },
          { name: 'oauth', train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('throws if initial versions has length three', () => {
    assert.throws(() => fxhey(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { name: 'content', train: 81, patch: 0 },
          { name: 'auth', train: 81, patch: 0 },
          { name: 'oauth', train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('throws if version train is zero', () => {
    assert.throws(() => fxhey(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { name: 'content', train: 81, patch: 0 },
          { name: 'auth', train: 81, patch: 0 },
          { name: 'profile', train: 81, patch: 0 },
          { name: 'oauth', train: 0, patch: 0 }
        ]
      }
    }))
  })

  test('throws if version train is greater than initial train', () => {
    assert.throws(() => fxhey(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { name: 'content', train: 81, patch: 0 },
          { name: 'auth', train: 81, patch: 0 },
          { name: 'profile', train: 82, patch: 0 },
          { name: 'oauth', train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('throws if version patch is negative', () => {
    assert.throws(() => fxhey(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { name: 'content', train: 81, patch: 0 },
          { name: 'auth', train: 81, patch: -1 },
          { name: 'profile', train: 81, patch: 0 },
          { name: 'oauth', train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('does not throw if initial status is valid', () => {
    assert.doesNotThrow(() => fxhey(() => {}, {
      status: {
        train: 81,
        time: Date.now(),
        versions: [
          { name: 'content', train: 81, patch: 0 },
          { name: 'auth', train: 81, patch: 0 },
          { name: 'profile', train: 81, patch: 0 },
          { name: 'oauth', train: 81, patch: 0 }
        ]
      }
    }))
  })

  test('does not throw without options', () => {
    assert.doesNotThrow(() => fxhey(() => {}))
  })

  test('throws if callback is not a function', () => {
    assert.throws(() => fxhey({}))
  })

  suite('fxhey with patch difference:', () => {
    let now, afterCallback, callback, cancel

    setup(done => {
      now = Date.now()
      sinon.stub(Date, 'now').callsFake(() => now)
      afterCallback = done
      callback = sinon.spy(() => afterCallback())
      version.version = '0.81.5'
      cancel = fxhey(callback, {
        status: {
          train: 81,
          time: now - 1,
          versions: [
            { name: 'content', train: 81, patch: 1, time: now - 1 },
            { name: 'auth', train: 81, patch: 2, time: now - 1 },
            { name: 'profile', train: 81, patch: 3, time: now - 1 },
            { name: 'oauth', train: 81, patch: 4, time: now - 1 }
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
      const args = got.args[0]
      assert.lengthOf(args, 2)
      assert.equal(args[0], 'https://accounts.firefox.com/ver.json')
      assert.deepEqual(args[1], {
        json: true,
        headers: {
          'User-Agent': `FxHey/${pkg.version} (https://gitlab.com/philbooth/fxhey)`
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
          { name: 'content', current: { train: 81, patch: 5 }, previous: { train: 81, patch: 1 } },
          { name: 'auth', current: { train: 81, patch: 5 }, previous: { train: 81, patch: 2 } },
          { name: 'profile', current: { train: 81, patch: 5 }, previous: { train: 81, patch: 3 } },
          { name: 'oauth', current: { train: 81, patch: 5 }, previous: { train: 81, patch: 4 } }
        ],
        patches: [
          { name: 'content', train: 81, patch: 5 },
          { name: 'auth', train: 81, patch: 5 },
          { name: 'profile', train: 81, patch: 5 },
          { name: 'oauth', train: 81, patch: 5 }
        ],
        versions: [
          { name: 'content', train: 81, patch: 5, tag: 'v0.81.5', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
          { name: 'auth', train: 81, patch: 5, tag: 'v0.81.5', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
          { name: 'profile', train: 81, patch: 5, tag: 'v0.81.5', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
          { name: 'oauth', train: 81, patch: 5, tag: 'v0.81.5', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now }
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
        version.version = '0.81.6'
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
            { name: 'content', current: { train: 81, patch: 6 }, previous: { train: 81, patch: 5 } },
            { name: 'auth', current: { train: 81, patch: 6 }, previous: { train: 81, patch: 5 } },
            { name: 'profile', current: { train: 81, patch: 6 }, previous: { train: 81, patch: 5 } },
            { name: 'oauth', current: { train: 81, patch: 6 }, previous: { train: 81, patch: 5 } }
          ],
          patches: [
            { name: 'content', train: 81, patch: 6 },
            { name: 'auth', train: 81, patch: 6 },
            { name: 'profile', train: 81, patch: 6 },
            { name: 'oauth', train: 81, patch: 6 }
          ],
          versions: [
            { name: 'content', train: 81, patch: 6, tag: 'v0.81.6', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
            { name: 'auth', train: 81, patch: 6, tag: 'v0.81.6', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
            { name: 'profile', train: 81, patch: 6, tag: 'v0.81.6', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
            { name: 'oauth', train: 81, patch: 6, tag: 'v0.81.6', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now }
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

  suite('fxhey with version difference:', () => {
    let now, callback

    setup(done => {
      now = Date.now()
      sinon.stub(Date, 'now').callsFake(() => now)
      callback = sinon.spy(done)
      version.version = '1.82.0'
      fxhey(callback, {
        status: {
          train: 81,
          time: now - 1,
          versions: [
            { name: 'content', train: 81, patch: 0, time: now - 1 },
            { name: 'auth', train: 81, patch: 0, time: now - 1 },
            { name: 'profile', train: 81, patch: 0, time: now - 1 },
            { name: 'oauth', train: 81, patch: 0, time: now - 1 }
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
          { name: 'content', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
          { name: 'auth', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
          { name: 'profile', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
          { name: 'oauth', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now }
        ]
      })
    })
  })

  suite('fxhey with partial difference:', () => {
    let now, callback

    setup(done => {
      now = Date.now()
      sinon.stub(Date, 'now').callsFake(() => now)
      callback = sinon.spy(done)
      version.version = '1.82.0'
      fxhey(callback, {
        status: {
          train: 82,
          time: now - 1,
          versions: [
            { name: 'content', train: 82, patch: 0, time: now - 1 },
            { name: 'auth', train: 82, patch: 0, time: now - 1 },
            { name: 'profile', train: 82, patch: 0, time: now - 1 },
            { name: 'oauth', train: 81, patch: 0, time: now - 1 }
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
          { name: 'oauth', current: { train: 82, patch: 0 }, previous: { train: 81, patch: 0 } }
        ],
        patches: [],
        versions: [
          { name: 'content', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now - 1 },
          { name: 'auth', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now - 1 },
          { name: 'profile', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now - 1 },
          { name: 'oauth', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now }
        ]
      })
    })
  })

  suite('fxhey with no differences:', () => {
    let now, callback

    setup(() => {
      now = Date.now()
      sinon.stub(Date, 'now').callsFake(() => now)
      callback = sinon.spy()
      version.version = '1.81.0'
      fxhey(callback, {
        status: {
          train: 81,
          time: now - 1,
          versions: [
            { name: 'content', train: 81, patch: 0 },
            { name: 'auth', train: 81, patch: 0 },
            { name: 'profile', train: 81, patch: 0 },
            { name: 'oauth', train: 81, patch: 0 }
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

  suite('fxhey with version and ordering differences:', () => {
    let now, callback

    setup(done => {
      now = Date.now()
      sinon.stub(Date, 'now').callsFake(() => now)
      callback = sinon.spy(done)
      version.version = '1.82.0'
      fxhey(callback, {
        status: {
          train: 81,
          time: now - 1,
          versions: [
            { name: 'oauth', train: 81, patch: 1, time: now - 1 },
            { name: 'profile', train: 81, patch: 2, time: now - 1 },
            { name: 'auth', train: 81, patch: 3, time: now - 1 },
            { name: 'content', train: 81, patch: 4, time: now - 1 }
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
          { name: 'content', current: { train: 82, patch: 0 }, previous: { train: 81, patch: 4 } },
          { name: 'auth', current: { train: 82, patch: 0 }, previous: { train: 81, patch: 3 } },
          { name: 'profile', current: { train: 82, patch: 0 }, previous: { train: 81, patch: 2 } },
          { name: 'oauth', current: { train: 82, patch: 0 }, previous: { train: 81, patch: 1 } }
        ],
        patches: [],
        versions: [
          { name: 'content', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
          { name: 'auth', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
          { name: 'profile', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now },
          { name: 'oauth', train: 82, patch: 0, tag: 'v1.82.0', commit: '75ca755f94be44c06c55fab8e3fccfedb0e4b59e', repo: 'mozilla/fxa', time: now }
        ]
      })
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
        train: 81,
        versions: [
          { name: 'content', train: 81, patch: 0 },
          { name: 'auth', train: 81, patch: 0 },
          { name: 'profile', train: 81, patch: 0 },
          { name: 'oauth', train: 81, patch: 0 }
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
    assert.equal(result.versions[0].repo, 'mozilla/fxa-content-server')
    assert.equal(result.versions[1].name, 'auth')
    assert.equal(result.versions[1].repo, 'mozilla/fxa-auth-server-private')
    assert.equal(result.versions[2].name, 'profile')
    assert.equal(result.versions[2].repo, 'mozilla/fxa-profile-server')
    assert.equal(result.versions[3].name, 'oauth')
    assert.equal(result.versions[3].repo, 'mozilla/fxa-oauth-server')
  })
})

