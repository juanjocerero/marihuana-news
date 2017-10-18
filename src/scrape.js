/* 
http://www.ideal.es/sociedad/falta-lluvia-olor-20171017095518-nt.html
http://www.ideal.es/granada/201607/18/inadmisible-servicio-sabotajes-terceros-20160715020718-v.html
http://www.ideal.es/granada/201703/19/muchas-pistolas-escopetas-barrio-20170319000631-v.html
http://www.ideal.es/granada/v/20100611/cultura/miguel-rios-quiere-rolling-20100611.html
*/

/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

import puppeteer from 'puppeteer'
import devices from 'puppeteer/DeviceDescriptors'
import _ from 'lodash'
import moment from 'moment'
import mongoose from 'mongoose'
import titleCase from 'title-case'
import stringify from 'csv-stringify'
import path from 'path'
import * as fs from 'fs'

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
      headless: true,
      timeout: 60000
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
      console.log(`${pages.length} pages`)
      let allUrls = []
      puppeteer.launch({
        ignoreHTTPSErrors: true,
        headless: true,
        timeout: 60000
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
          resolve(_.uniqBy(allUrls, JSON.stringify))
          await tab.close()
          await browser.close()
        })
    })
  } catch (error) {
    console.error(`Error getting urls: ${error}`)
  }
  
}

const parse = urls => {
  const articles = []
  try {
    return new Promise((resolve, reject) => {
      puppeteer.launch({
        ignoreHTTPSErrors: true,
        headless: true,
        timeout: 60000
      })
        .then(async browser => {
          const tab = await browser.newPage()
          // await tab.emulate(devices['iPhone 6 Plus'])
          for (let i = 0; i < urls.length; i++) {
            try {
              console.log(`scraping ${urls[i]}`)
              await tab.goto(urls[i], { waitUntil: 'load' })
              // await tab.waitForSelector('.voc-aside-margin')
            } catch (error) {
              console.error(`Couldn't load URL: ${urls[i]}`)
            }

            let article = await tab.evaluate(() => {

              let obj = {}

              if (document.querySelectorAll('.voc-static-404').length <= 0) {

                obj.url = document.URL

                // Es el último rediseño
                if (Array.from(document.querySelectorAll('.voc-author-info'))[0]) {

                  obj.age = 0

                  let autorFecha = Array.from(document.querySelectorAll('.voc-author-info'))[0].children

                  obj.fecha = Array.from(autorFecha).filter(e => e.tagName === 'TIME')[0].innerText.trim()

                  if (Array.from(autorFecha).filter(e => e.tagName === 'AUTHOR').length > 0) {
                    obj.autor = Array.from(autorFecha)
                      .filter(e => e.tagName === 'AUTHOR')[0].innerText
                      .replace('Granada', '')
                      .replace('GRANADA', '')
                      .trim()
                  } else {
                    obj.autor = ''
                  }

                  let heading = Array.from(document.querySelectorAll('.voc-detail-header'))[0].children

                  let htmlParagraphs = Array.from(Array.from(document.querySelectorAll('div.voc-detail'))
                    .map(d => d.getElementsByTagName('p'))[0])
                    .filter(p => !p.id && !p.classList.contains('vjs-control-text'))
                  
                  obj.titular = Array.from(heading).filter(e => e.tagName === 'H1').map(e => e.innerText).toString()

                  obj.subtitulo = Array.from(heading).filter(e => e.tagName === 'H2').map(e => e.innerText).toString()

                  if (Array.from(heading).filter(e => e.tagName === 'FIGURE')[0]) {
                    let img = Array.from(Array.from(heading)
                      .filter(e => e.tagName === 'FIGURE')[0].children)
                      .filter(c => c.tagName === 'DIV')[0].children[0].currentSrc
                    if (img !== undefined) {
                      obj.img = img
                    } else {
                      obj.img = ''
                    }
                  } else {
                    obj.img = ''
                  }

                  obj.text = Array.from(htmlParagraphs).map(p => p.innerText).join('\n').toString()

                  if (Array.from(document.querySelectorAll('.voc-topics'))[0]) {
                    let tags = Array.from(Array.from(document.querySelectorAll('.voc-topics'))[0].children)
                      .filter(e => e.tagName !== 'H3').map(a => a.innerText)
                    if (tags !== undefined) {
                      obj.tags = tags
                    } else {
                      obj.tags = []
                    }
                  } else {
                    obj.tags = []
                  }
                }

                // Es el diseño anterior al último
                else if (Array.from(document.querySelectorAll('.span12 h1'))[0]) {

                  obj.age = 1

                  if (Array.from(document.querySelectorAll('.span12 h1'))[0]) {
                    obj.titular = Array.from(document.querySelectorAll('.span12 h1'))[0].innerText.trim()
                  }

                  if (Array.from(document.querySelectorAll('.subhead h2'))[0]) {
                    obj.subtitulo = Array.from(document.querySelectorAll('.subhead h2'))[0].innerText.trim()
                  }

                  if (Array.from(document.querySelectorAll('.autor .avatar'))[0]) {
                    obj.autor = Array.from(document.querySelectorAll('.autor .avatar'))[0].innerText.trim()
                  }

                  if (Array.from(document.querySelectorAll('.date'))[0]) {
                    obj.fecha = Array.from(Array.from(document.querySelectorAll('.date'))[0].children)[0].innerText.trim().replace('\n', ' ')
                  }

                  if (document.querySelectorAll('.contenido p').length > 0) {
                    obj.text = Array.from(document.querySelectorAll('.contenido p')).map(p => p.innerText.trim()).join('\n')
                  }

                  if (document.querySelectorAll('.photo').length > 0 && document.querySelectorAll('.photo img').length > 0) {
                    obj.img = document.querySelectorAll('.photo img')[0].currentSrc.trim()
                  }

                  if (document.querySelectorAll('.temasTopic li').length > 0) {
                    obj.tags = Array.from(document.querySelectorAll('.temasTopic li')).map(li => li.innerText.replace(',', '').trim())
                  }
                }

                // Es el diseño más viejo
                else if (Array.from(document.querySelectorAll('h1.headline'))[0]) {

                  obj.age = 2

                  if (document.querySelectorAll('h1.headline').length > 0) {
                    obj.titular = document.querySelector('h1.headline').innerText.trim()
                  }

                  if (document.querySelectorAll('h2.subhead').length > 0) {
                    obj.subtitulo = document.querySelector('h2.subhead').innerText.trim()
                  }

                  if (document.querySelectorAll('div.date').length > 0) {
                    let autorFecha = document.querySelector('div.date')
                    obj.fecha = autorFecha.innerText.split('-')[0].concat(autorFecha.innerText.split('-')[1]).replace('  ', ' ').replaceAll('.', '/').trim()
                    let autor = autorFecha.innerText.split('-')[autorFecha.innerText.split('-').length - 1].split('|')[0].trim()
                  }

                  if (document.querySelectorAll('#story-texto').length > 0) {
                    obj.text = Array.from(document.querySelector('#story-texto').children).map(p => p.innerText.trim()).join('\n')
                  }

                  if (Object.keys(obj).length > 2) {
                    obj.img = ''
                    obj.tags = []
                  }

                }

                return Object.keys(obj).length > 2 ? obj : null
              }

            })

            if (article) {
              articles.push(article)
            }
          }
          resolve(articles)
          await tab.close()
          await browser.close()
        })
    })
  } catch (error) {
    console.error(`Error scraping single article: ${error}`)
  }
}

const parseDatesAndTitleCase = articles => new Promise((resolve, reject) => {
  resolve(articles.map(a => {
    if (a.age === 0) {
      let date = moment(a.fecha, 'MMMM Do YYYY, h:mm:ss').toDate()
      a.date = date
    } else if (a.age === 1) {
      let date = moment(a.fecha, 'DD MMMM YYYY h:mm').toDate()
      a.date = date
    } else if (a.age === 2) {
      let date = moment(a.fecha, 'DD/MM/YY h:mm').toDate()
      a.date = date
    }
    a.autor = titleCase(a.autor)
    a.titular = titleCase(a.titular)
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
    console.error(`Error persisting to database: ${error}`)
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

const exportUrls = urls => {
  return new Promise((resolve, reject) => {
    console.log('exporting to csv')
    stringify([].concat(urls.join('\n')), (error, output) => {
      if (error) {
        console.log(`Error writing CSV: ${error}`)
      }
      try {
        fs.writeFileSync(
          path.join(__dirname, './../urls.csv'),
          output
        )
        resolve(urls)        
      } catch (error) {
        console.log(`Error writing CSV: ${error}`)
      }
    })
  })
}

async function scrape() {
  getPages()
    .then(pages => generateUrlsFor(pages))
    .then(pages => getNewsUrls(pages))
    .then(urls => exportUrls(urls))
    .then(urls => parse(urls))
    .then(articles => parseDatesAndTitleCase(articles))
    .then(articles => persist(articles))
}

scrape()
