'use strict'

const { assert } = require('check-types')
const got = require('got')
const { setInterval, clearInterval } = require('timers')
const pkg = require('./package.json')

const DEFAULT_RATE = 1000 * 60 * 60
const MINIMUM_RATE = DEFAULT_RATE / 2
const DEFAULT_USER_AGENT = `FxOi/${pkg.version} (https://github.com/philbooth/fxoi)`
const REPO_MATCH = /mozilla\/fxa(?:-[a-z]+){2}(?:-private)?/
const SERVERS = [
  { name: 'content', url: 'https://accounts.firefox.com/ver.json' },
  { name: 'auth', url: 'https://api.accounts.firefox.com/__version__' },
  { name: 'profile', url: 'https://profile.accounts.firefox.com/__version__' },
  { name: 'oauth', url: 'https://oauth.accounts.firefox.com/__version__' }
]

let previousStatus

module.exports = (
  callback,
  {
    rate = DEFAULT_RATE,
    immediate = true,
    userAgent = DEFAULT_USER_AGENT,
    status = {
      train: 81,
      time: Date.UTC(2017, 2, 3, 23, 12),
      versions: [
        { train: 81, patch: 0 },
        { train: 81, patch: 2 },
        { train: 79, patch: 0 },
        { train: 81, patch: 0 }
      ]
    }
  } = {}
) => {
  assert.function(callback)
  assert.greaterOrEqual(rate, MINIMUM_RATE)
  assert.nonEmptyString(userAgent)
  assert.object(status)
  assert.greater(status.train, 0)
  assert.positive(status.time)
  assert.array.of.object(status.versions)
  assert.hasLength(status.versions, 4)
  status.versions.forEach(version => {
    assert.positive(version.train)
    assert.lessOrEqual(version.train, status.train)
    assert.greaterOrEqual(version.patch, 0)
  })

  previousStatus = clone(status)

  if (immediate) {
    getStatus(userAgent, callback)
  }

  let interval = setInterval(getStatus.bind(null, userAgent, callback), rate)

  return () => {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
  }
}

function getStatus (userAgent, callback) {
  return fetchVersions(userAgent)
    .then(generateStatus)
    .then(
      status => {
        previousStatus = clone(status)
        if (status.diffs.length > 0) {
          callback(null, status)
        }
      },
      error => callback(error, clone(previousStatus))
    )
    .catch(err => console.error(err))
}

function fetchVersions (userAgent) {
  return Promise.all(SERVERS.map(server => {
    return got(server.url, { json: true, headers: { 'User-Agent': userAgent } })
      .then(result => {
        const body = result.body
        return {
          name: server.name,
          version: body.version,
          repo: parseRepo(body.source),
          tag: `v${body.version}`,
          commit: body.commit
        }
      })
  }))
}

function parseRepo (source) {
  return REPO_MATCH.exec(source)[0]
}

function generateStatus (versions) {
  const result = versions.reduce((status, version, index) => {
    const { train, patch } = parseVersion(version.version)
    const { name, tag, commit, repo } = version
    const { train: previousTrain, patch: previousPatch } = previousStatus.versions[index]

    if (train > status.train) {
      status.train = train
    }

    if (train !== previousTrain || patch !== previousPatch) {
      status.diffs.push({
        name,
        current: { train, patch },
        previous: { train: previousTrain, patch: previousPatch }
      })
      if (status.time === previousStatus.time) {
        status.time = Date.now()
      }
    }

    if (patch > 0 && train === status.train) {
      status.patches.push({ name, train, patch })
    }

    status.versions.push({ name, train, patch, tag, commit, repo })

    return status
  }, {
    train: previousStatus.train,
    time: previousStatus.time,
    diffs: [],
    patches: [],
    versions: []
  })

  result.patches = result.patches.filter(patch => patch.train === result.train)

  return result
}

function parseVersion (version) {
  const split = version.split('.')
  return {
    train: parseInt(split[1]),
    patch: parseInt(split[2])
  }
}

function clone (value) {
  if (! value || typeof value !== 'object') {
    return value
  }

  return Object.keys(value).reduce((cloned, key) => {
    cloned[key] = clone(value[key])
    return cloned
  }, {})
}

