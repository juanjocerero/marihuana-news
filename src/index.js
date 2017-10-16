/* eslint-disable */

import puppeteer from 'puppeteer'
import devices from 'puppeteer/DeviceDescriptors'
import _ from 'lodash'
import moment from 'moment'

const START_PAGE = 'http://www.ideal.es/hemeroteca/marihuana%20granada.html?order=-fecha'

moment.locale('es')

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
    puppeteer.launch({
      ignoreHTTPSErrors: true,
      headless: false
    })
    .then(async browser => {
      const tab = await browser.newPage()
      await tab.emulate(devices['iPhone 6 Plus'])
      for (let i = 0; i < urls.length; i++) {
        await tab.goto(urls[i], { waitUntil: 'networkidle' })
        let article = await tab.evaluate(() => {
          let autorFecha = Array.from(document.querySelectorAll('.voc-author-info'))[0].children
          let fecha = Array.from(autorFecha).filter(e => e.tagName === 'TIME')[0].innerText.trim()
          let date = moment(fecha, 'MMMM Do YYYY, h:mm:ss')
          let autor = Array.from(autorFecha).filter(e => e.tagName === 'AUTHOR')[0].innerText

          let heading = Array.from(document.querySelectorAll('.voc-detail-header'))[0].children
          let titular = Array.from(heading).filter(e => e.tagName === 'H1').map(e => e.innerText).toString()
          let subtitulo = Array.from(heading).filter(e => e.tagName === 'H2').map(e => e.innerText).toString()
          let img = Array.from(Array.from(heading).filter(e => e.tagName === 'FIGURE')[0].children).filter(c => c.tagName === 'DIV')[0].children[0].currentSrc

          let htmlParagraphs = Array.from(document.querySelectorAll('div.voc-detail')).map(d => d.getElementsByTagName('p'))[0]
          let text = Array.from(htmlParagraphs).map(p => p.innerText).join('\n').toString()

          let tagsArray = Array.from(Array.from(document.querySelectorAll('.voc-topics'))[0].children).filter(e => e.tagName !== 'H3').map(a => a.innerText)

          // TODO: return serialized object as JSON and save it to MongoDB
        })
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}


getPages()
.then(pages => generateUrlsFor(pages)
.then(pages => getNewsUrls(pages.slice(0,10))
.then(urls => parse(urls))
))
