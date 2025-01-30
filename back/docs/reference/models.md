# Database Models

Welcome to the comprehensive database models reference for **Sonari**! Here, you'll
discover an organized collection of all the database models defined within the
Sonari framework. Our categorization mirrors the structure outlined in
[`soundevent`](https://mbsantiago.github.io/soundevent/data_schemas/).

The models within **Sonari** share an analogical relationship with those in
`soundevent` and are essentially a **SQLAlchemy** port. While the core concepts remain
consistent, it's essential to note that some minor differences do exist.

## Data Descriptors

### Users

::: sonari.models.User
    options:
        heading_level: 4
        members: None

### Tags

::: sonari.models.Tag
    options:
        heading_level: 4
        members: None

### Features

::: sonari.models.FeatureName
    options:
        members: None
        heading_level: 4

### Notes

::: sonari.models.Note
    options:
        heading_level: 4
        members: None

## Audio Content

### Recordings

::: sonari.models.Recording
    options:
        heading_level: 4
        members: None

::: sonari.models.RecordingTag
    options:
        heading_level: 4
        members: None

::: sonari.models.RecordingNote
    options:
        heading_level: 4
        members: None

::: sonari.models.RecordingFeature
    options:
        heading_level: 4
        members: None

::: sonari.models.RecordingOwner
    options:
        heading_level: 4
        members: None

### Datasets

::: sonari.models.Dataset
    options:
        heading_level: 4
        members: None

::: sonari.models.DatasetRecording
    options:
        heading_level: 4
        members: None

## Acoustic Objects

### Sound Events

::: sonari.models.SoundEvent
    options:
        heading_level: 4
        members: None

::: sonari.models.SoundEventFeature
    options:
        heading_level: 4
        members: None

### Clips

::: sonari.models.Clip
    options:
        heading_level: 4
        members: None

::: sonari.models.ClipFeature
    options:
        heading_level: 4
        members: None

## Annotation

### Sound Event Annotation

::: sonari.models.SoundEventAnnotation
    options:
        heading_level: 4
        members: None

::: sonari.models.SoundEventAnnotationTag
    options:
        heading_level: 4
        members: None

::: sonari.models.SoundEventAnnotationNote
    options:
        heading_level: 4
        members: None

### Clip Annotation

::: sonari.models.ClipAnnotation
    options:
        heading_level: 4
        members: None

::: sonari.models.ClipAnnotationTag
    options:
        heading_level: 4
        members: None

::: sonari.models.ClipAnnotationNote
    options:
        heading_level: 4
        members: None

### Annotation Task

::: sonari.models.AnnotationTask
    options:
        heading_level: 4
        members: None

::: sonari.models.AnnotationStatusBadge
    options:
        heading_level: 4
        members: None

### Annotation Project

::: sonari.models.AnnotationProject
    options:
        heading_level: 4
        members: None

::: sonari.models.AnnotationProjectTag
    options:
        heading_level: 4
        members: None

## Prediction

### Sound Event Prediction

::: sonari.models.SoundEventPrediction
    options:
        heading_level: 4
        members: None

::: sonari.models.SoundEventPredictionTag
    options:
        heading_level: 4
        members: None

### Clip Prediction

::: sonari.models.ClipPrediction
    options:
        heading_level: 4
        members: None

::: sonari.models.ClipPredictionTag
    options:
        heading_level: 4
        members: None

### Model Run

::: sonari.models.ModelRun
    options:
        heading_level: 4
        members: None

### User Run

::: sonari.models.UserRun
    options:
        heading_level: 4
        members: None

## Evaluation

### Sound Event Evaluation

::: sonari.models.SoundEventEvaluation
    options:
        heading_level: 4
        members: None

::: sonari.models.SoundEventEvaluationMetric
    options:
        heading_level: 4
        members: None

### Clip Evaluation

::: sonari.models.ClipEvaluation
    options:
        heading_level: 4
        members: None

::: sonari.models.ClipEvaluationMetric
    options:
        heading_level: 4
        members: None

### Evaluation

::: sonari.models.Evaluation
    options:
        heading_level: 4
        members: None

::: sonari.models.EvaluationMetric
    options:
        heading_level: 4
        members: None

### Evaluation Set

::: sonari.models.EvaluationSet
    options:
        heading_level: 4
        members: None

::: sonari.models.EvaluationSetTag
    options:
        heading_level: 4
        members: None

::: sonari.models.EvaluationSetAnnotation
    options:
        heading_level: 4
        members: None
