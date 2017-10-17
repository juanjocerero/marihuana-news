import mongoose from 'mongoose'

const articleSchema = new mongoose.Schema({
  fecha: String,
  date: Date,
  autor: String,
  titular: String,
  subtitulo: String,
  text: String,
  tags: Array
})

const Article = mongoose.model('Article', articleSchema)

export default Article
