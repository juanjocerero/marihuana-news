/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

import puppeteer from 'puppeteer'
import devices from 'puppeteer/DeviceDescriptors'
import _ from 'lodash'
import moment from 'moment'
import mongoose from 'mongoose'
import titleCase from 'title-case'

import Article from './models/article'

const START_PAGE = 'http://www.ideal.es/hemeroteca/marihuana%20granada.html?order=-fecha'
const DB_URL = 'mongodb://localhost/marihuana-articles'

moment.locale('es')
mongoose.Promise = Promise
mongoose.set('debug', false)

const generateUrlsFor = number => {
  return new Promise((resolve, reject) => {
    let arr = []
    arr.push(START_PAGE)
    for (let i = 2; i <= number; i++) {
      arr.push(getUrlForPage(i))
    }
    resolve(arr)
  })
}

const getUrlForPage = num => START_PAGE.split('?')[0].concat(`?pag=${num}&`).concat(START_PAGE.split('?')[1])

const getPages = () => {
  return new Promise((resolve, reject) => {
    puppeteer.launch({
      ignoreHTTPSErrors: true,
      headless: true
    }).then(async browser => {
      const page = await browser.newPage()
      await page.emulate(devices['iPhone 6 Plus'])
      await page.goto(START_PAGE, { waitUntil: 'networkidle' })
      await page.waitForSelector('.voc-pagination')
      let pages = await page.evaluate(() => {
        let lastListElement = document.querySelectorAll('.voc-pagination li')[Array.from(document.querySelectorAll('.voc-pagination li')).length - 1]
        return +(lastListElement.firstChild.getAttribute('href').split('?')[1].split('&')[0].split('=')[1])
      })
      await browser.close()
      resolve(pages)
    })
  })
}

const getNewsUrls = pages => {
  try {
    return new Promise((resolve, reject) => {
      let allUrls = []
      puppeteer.launch({
        ignoreHTTPSErrors: true,
        headless: true
      })
        .then(async browser => {
          const tab = await browser.newPage()
          await tab.emulate(devices['iPhone 6 Plus'])
          for (let i = 0; i < pages.length; i++) {
            await tab.goto(pages[i], { waitUntil: 'load' })
            let articleUrls = await tab.evaluate(() => {
              let ret = []
              let articleChildren = Array.from(document.querySelectorAll('article')).map(a => a.children)
              articleChildren.forEach(a => {
                for (item of a) {
                  if (item.tagName === 'PICTURE') {
                    ret.push(item.children[0].href)
                  }
                }
              })
              return Promise.resolve(JSON.stringify(ret))
            })
            await JSON.parse(articleUrls).forEach(url => allUrls.push(url))
            console.log(`${allUrls.length} urls gathered`)
          }
          resolve(allUrls)
          await tab.close()
          await browser.close()
        })
    })
  } catch (error) {
    throw new Error(error)
  }
  
}

const parse = urls => {
  const articles = []
  try {
    return new Promise((resolve, reject) => {
      puppeteer.launch({
        ignoreHTTPSErrors: true,
        headless: false,
        timeout: 60000
      })
        .then(async browser => {
          const tab = await browser.newPage()
          // await tab.emulate(devices['iPhone 6 Plus'])
          for (let i = 0; i < urls.length; i++) {
            await tab.goto(urls[i], { waitUntil: 'load' })
            await tab.waitForSelector('.voc-aside-margin')
            let article = await tab.evaluate(() => {
              
              let autorFecha = Array.from(document.querySelectorAll('.voc-author-info'))[0].children
              let heading = Array.from(document.querySelectorAll('.voc-detail-header'))[0].children
              let htmlParagraphs = Array.from(document.querySelectorAll('div.voc-detail')).map(d => d.getElementsByTagName('p'))[0]
              
              return {
                fecha: Array.from(autorFecha)
                  .filter(e => e.tagName === 'TIME')[0].innerText.trim(),
                autor: Array.from(autorFecha)
                  .filter(e => e.tagName === 'AUTHOR')[0].innerText
                  .replace('Granada',''),
                titular: Array.from(heading)
                  .filter(e => e.tagName === 'H1')
                  .map(e => e.innerText).toString(),
                subtitulo: Array.from(heading)
                  .filter(e => e.tagName === 'H2')
                  .map(e => e.innerText).toString(),
                img: Array.from(Array.from(heading)
                  .filter(e => e.tagName === 'FIGURE')[0].children)
                  .filter(c => c.tagName === 'DIV')[0].children[0].currentSrc,
                text: Array.from(htmlParagraphs)
                  .map(p => p.innerText).join('\n').toString(),
                tags: Array.from(Array.from(document.querySelectorAll('.voc-topics'))[0].children)
                  .filter(e => e.tagName !== 'H3').map(a => a.innerText)
              }
            })
            console.log(`Added article: ${article.titular} (${article.fecha})`)
            articles.push(article)
          }
          resolve(articles)
          await tab.close()
          await browser.close()
        })
    })
  } catch (error) {
    throw new Error(error)
  }
}

const parseDatesAndTitleCase = articles => new Promise((resolve, reject) => {
  resolve(articles.map(a => {
    let date = moment(a.fecha, 'MMMM Do YYYY, h:mm:ss').toDate()
    a.date = date.setHours(date.getHours() + 2)
    a.autor = titleCase(a.autor)
    return a
  }))
})

const persist = async articles => {
  try {
    await mongoose.connect(DB_URL, { useMongoClient: true }, (error) => {
      if (error) {
        throw new Error(error)
      }
    })
    const db = mongoose.connection
    db.on('error', console.error.bind(console, 'db connection error:'))

    await saveToDb(articles)

    console.log('Finished. Exiting...')
    setTimeout(() => {
      mongoose.disconnect()
      process.exit(0) 
    }, 10000)
  } catch (error) {
    throw new Error(error)
  }
}

const saveToDb = async articles => {
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  }
  _.forEach(articles, article => {
    console.log(`Saving ${article.titular}`)
    let conditions = { titular: article.titular }
    Article.findOneAndUpdate(conditions, article, options, (error, result) => {
      if (error) {
        throw new Error(error)
      }
    })
  })
  return
}

async function scrape() {
  getPages()
    .then(pages => generateUrlsFor(pages))
    .then(pages => getNewsUrls(pages.slice(0, 1)))
    .then(urls => parse(urls.slice(0,1)))
    .then(articles => parseDatesAndTitleCase(articles))
    .then(articles => persist(articles))
  
}

scrape()
