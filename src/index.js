/* eslint-disable */

import puppeteer from 'puppeteer'
import devices from 'puppeteer/DeviceDescriptors'
import _ from 'lodash'
import moment from 'moment'

const START_PAGE = 'http://www.ideal.es/hemeroteca/marihuana%20granada.html?order=-fecha'

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
        headless: false
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
  // todo: treatment
}

getPages()
.then(pages => generateUrlsFor(pages)
.then(pages => getNewsUrls(pages.slice(0,10))
.then(urls => parse(urls))
))
