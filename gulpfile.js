var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var babel = require('gulp-babel');

var path = require('path');

var SOURCE_PATH = 'src/**/*.js';
var OUTPUT_DIR = 'dist'

var paths = {
     es6: ['es6/**/*.js'],
     es5: 'es5',
     // Must be absolute or relative to source map
     sourceRoot: path.join(__dirname, 'es6'),
};


gulp.task('babel', function () {
  return gulp.src(SOURCE_PATH)
    .pipe(sourcemaps.init())
    .pipe(babel())
    .on('error', function (err) {
      console.log('Babel Error', err);
      this.emit('end');
    })
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(OUTPUT_DIR));
});

gulp.task('watch', function () {
  gulp.watch(SOURCE_PATH, ['babel']);
});

gulp.task('default', ['babel']);
