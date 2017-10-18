import mongoose from 'mongoose'

const articleSchema = new mongoose.Schema({
  fecha: String,
  date: String,
  autor: String,
  titular: String,
  subtitulo: String,
  text: String,
  tags: Array,
  url: String,
  age: Number
})

const Article = mongoose.model('Article', articleSchema)

export default Article
