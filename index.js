const fs = require('fs/promises')
const fetch = require('make-fetch-happen').defaults({
  cacheManager: './node_modules/.cache/make-fetch-happen',
})

const csv = require('csvtojson')
require('dotenv').config()

const {CONVERT_KIT_API_KEY, CONVERT_KIT_API_SECRET} = process.env

const tagIds = {
  Purchased: '746921',
  'Purchased Testing': '746923',
  'Standard Testing': '746934',
  'Basic Testing': '746932',
  'Pro Testing': '746922',
  'Purchased Epic': '1791335',
  'Epic React Basic': '1791330',
  'Epic React Standard': '1791332',
  'Epic React Pro': '1791334',
}

const tagNames = {}
for (const [name, tagId] of Object.entries(tagIds)) {
  tagNames[tagId] = name
}

const possibleLevels = Object.keys(tagIds)

const appendToFinished = ({
  id = 'No Subscriber',
  first_name,
  email,
  levels = [],
  changed = false,
  needs = [],
  remove = [],
  previous_first_name = first_name,
}) => {
  return fs.appendFile(
    './finished.csv',
    [
      id,
      changed,
      first_name,
      email,
      levels.join(';'),
      needs.join(';'),
      remove.join(';'),
      previous_first_name,
    ].join(',') + '\n',
  )
}

async function getData() {
  const data = await csv().fromFile('./data.csv')
  const newDataByEmail = {}
  for (const item of data) {
    if (!newDataByEmail[item.email]) {
      newDataByEmail[item.email] = {
        first_name: item.first_name,
        email: item.email,
        levels: [item.level], // <-- renaming level to levels
      }
    } else {
      newDataByEmail[item.email].first_name =
        newDataByEmail[item.email].first_name ?? item.first_name
      newDataByEmail[item.email].levels = [
        ...newDataByEmail[item.email].levels,
        item.level,
      ]
    }
  }
  const newData = Object.values(newDataByEmail)
  return newData.map(d => {
    let levels = ['Purchased', ...d.levels]
    if (levels.join('').includes('Testing')) {
      levels.push('Purchased Testing')
    }
    if (levels.join('').includes('Epic')) {
      levels.push('Purchased Epic')
    }
    return {first_name: d.first_name, email: d.email, levels}
  })
}

async function go() {
  const data = await getData()
  const finishedEmails = (await csv().fromFile('./finished.csv')).map(
    f => f.email,
  )

  console.log(`Processing ${data.length} emails`)

  for (const item of data) {
    console.log(item)
    const {first_name, email, levels} = item
    if (finishedEmails.includes(email)) continue

    const percent = ((data.indexOf(item) / data.length) * 100).toFixed(2)
    console.log(`${percent}%`)

    const subscriber = await getConvertKitSubscriber(email)
    if (!subscriber) {
      // console.log('no subscriber:', item)
      appendToFinished(item)
      continue
    }
    const subscriberTags = await getTags(subscriber)
    const needs = []
    const remove = []
    for (const levelName of possibleLevels) {
      const tagId = tagIds[levelName]
      if (!tagId) throw new Error(`No tagId for ${levelName}`)

      const hasTag = subscriberTags.includes(tagId)
      if (levels.includes(levelName) && !hasTag) needs.push(tagId)
      else if (!levels.includes(levelName) && hasTag) remove.push(tagId)
    }
    const promises = [
      needs.length ? addTag(first_name, email, needs) : null,
      ...remove.map(r => removeTag(subscriber, r)),
      // if the subscriber already has a first name then we don't need to update it
      // the addTag function will set it as well so we don't need to update it if
      // they have tags that need to be updated too
      needs.length || subscriber.first_name
        ? null
        : updateFirstName(subscriber, first_name),
    ].filter(Boolean)
    if (promises.length) {
      const result = await Promise.all(promises)
      const errors = result.filter(r => r.error)
      if (errors.length) {
        throw new Error(JSON.stringify(errors, null, 2))
      }
      const meta = {
        id: subscriber.id,
        first_name,
        email,
        levels: levels,
        changed: true,
        needs: needs.map(n => tagNames[n]),
        remove: remove.map(r => tagNames[r]),
        previous_first_name: subscriber.first_name,
      }
      // console.log('done updating:', meta)
      appendToFinished(meta)
    } else {
      const meta = {
        id: subscriber.id,
        first_name,
        email,
        levels: levels,
      }
      // console.log('no update needed:', meta)
      appendToFinished(meta)
    }
  }
  console.log('All done...')
}

async function getConvertKitSubscriber(email) {
  const url = new URL('https://api.convertkit.com/v3/subscribers')
  url.searchParams.set('api_secret', CONVERT_KIT_API_SECRET)
  url.searchParams.set('email_address', email)

  const data = await fetch(url.toString()).then(r => r.json())

  const {subscribers: [subscriber] = []} = data

  return subscriber?.state === 'active' ? subscriber : null
}

async function getTags(subscriber) {
  return fetch(
    `https://api.convertkit.com/v3/subscribers/${subscriber.id}/tags?api_key=${CONVERT_KIT_API_KEY}`,
  )
    .then(r => r.json())
    .then(d => d.tags.map(t => String(t.id)))
}

async function addTag(first_name, email, tags) {
  console.log('adding', first_name, email, tags)
  // return fetch(
  //   `https://api.convertkit.com/v3/tags/${tagIds.Purchased}/subscribe`,
  //   {
  //     method: 'POST',
  //     headers: {'content-type': 'application/json'},
  //     body: JSON.stringify({
  //       api_key: CONVERT_KIT_API_KEY,
  //       api_secret: CONVERT_KIT_API_SECRET,
  //       first_name,
  //       email,
  //       tags,
  //     }),
  //   },
  // ).then(r => r.json())
}

async function removeTag(subscriber, tagId) {
  console.log('removing', subscriber.email, tagId)
  // return fetch(
  //   `https://api.convertkit.com/v3/subscribers/${subscriber.id}/tags/${tagId}?api_secret=${CONVERT_KIT_API_SECRET}`,
  //   {method: 'DELETE'},
  // ).then(r => r.json())
}

async function updateFirstName(subscriber, first_name) {
  console.log('updating first name', subscriber.email, first_name)
  // return fetch(`https://api.convertkit.com/v3/subscribers/${subscriber.id}`, {
  //   method: 'PUT',
  //   headers: {'content-type': 'application/json'},
  //   body: JSON.stringify({
  //     api_key: CONVERT_KIT_API_KEY,
  //     api_secret: CONVERT_KIT_API_SECRET,
  //     first_name,
  //   }),
  // }).then(r => r.json())
}

function makeGo() {
  go().catch(error => {
    if (error.stack?.includes?.('Unexpected token R in JSON at position 0')) {
      console.log('rate limited... wait a minute then continue.')
      setTimeout(() => {
        makeGo()
      }, 60 * 1000)
    }
    console.error(error.stack)
  })
}

makeGo()
