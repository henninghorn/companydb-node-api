// Load express
var express = require('express')
var app = express()
var bodyParser = require('body-parser')

// Set app port
var port = process.env.PORT || 3000

// Configure and use body-parser
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// Allow cross origin
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  next();
});

// Setup database
var knex = require('knex')({client: 'postgresql', connection: process.env.DATABASE_URI})
var bookshelf = require('bookshelf')(knex)

// Use bookshelf-modelbase plugin
bookshelf.plugin(require('bookshelf-modelbase').pluggable)

 // Validation
 var Joi = require('joi')

// Models
var Person = bookshelf.Model.extend({
  tableName: 'people',
  hasTimestamps: true,
  // Validation
  validate: {
    name: Joi.string().required()
  },
  // Relations
  companies () {
    return this.belongsToMany(Company, 'company_person', 'person_id', 'company_id')
  }
})

var Company = bookshelf.Model.extend({
  tableName: 'companies',
  hasTimestamps: true,

  // Validation
  validate: {
    name: Joi.string().required(),
    address: Joi.string().required(),
    city: Joi.string().required(),
    country: Joi.string().required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional()
  },

  // Relations
  people () {
    return this.belongsToMany(Person, 'company_person', 'company_id', 'person_id')
      .withPivot(['role'])
  }
})

// Transformers
var CompanyTransformer = function (company) {
  return {
    id: company.get('id'),
    name: company.get('name'),
    address: company.get('address'),
    city: company.get('city'),
    country: company.get('country'),
    email: company.get('email'),
    phone: company.get('phone'),
    people: company.related('people').toJSON().map(person => {
      return {
        id: person.id,
        name: person.name,
        role: person._pivot_role
      }
    })
  }
}

var router = express.Router()

router.route('/companies')
  // Get all companies
  // GET /companies
  .get((req, res) => {
    Company.findAll()
    .then(function (results) {
      res.json({
        data: results.toJSON()
      })
    }).catch(err => {
      res.json({
        error: err
      })
    })
  })

  // Create a company
  // POST /companies
  .post((req, res) => {
    Company.create({
      name: req.body.name,
      address: req.body.address,
      city: req.body.city,
      country: req.body.country,
      email: req.body.email,
      phone: req.body.phone
    })
    .then(company => {
      res.status(201).json({
        data: CompanyTransformer(company)
      })
    })
    .catch(err => {
      res.json({
        error: err
      })
    })
  })

router.route('/companies/:id(\\d+)')
  .get((req, res) => {
  Company.forge({id: req.params.id})
  .fetch({
    withRelated: ['people'],
    require: true
  })
  .then(function (company) {
    res.json({
      data: CompanyTransformer(company)
    })
  })
  .catch(Company.NotFoundError, () => {
    res.status(404).json({
      error: 'Company not found'
    })
  })
  .catch(err => {
    res.json({
      error: err
    })
  })
})

router.route('/companies/:id(\\d+)/people')
  .post((req, res) => {
    Person.forge({
      name: req.body.name
    })
    .save()
    .then(person => {
      Company.forge({id: req.params.id})
      .people()
      .attach(person)
      .then(result => {
        res.json({
          ok: result
        })
      })
      .catch(err => {
        res.json({
          error: err
        })
      })
    })
  })

app.use('/api', router)

app.listen(port)
