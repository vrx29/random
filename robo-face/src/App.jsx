import React, { useEffect, useRef, useState } from 'react'
import * as faceapi from 'face-api.js'
import './App.css'

const MODEL_URL = '/models'

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [gender, setGender] = useState('')
  const [expression, setExpression] = useState('')

  useEffect(() => {
    // load models from public/models (copy them there manually or via script)
    Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
    ]).then(startVideo)
  }, [])

  const startVideo = () => {
    navigator.mediaDevices
      .getUserMedia({ video: {} })
      .then((stream) => {
        const video = videoRef.current
        video.srcObject = stream
        // try to play, ignore aborts
        video.play().catch((e) => console.warn('video play interrupted', e))

        video.addEventListener('loadedmetadata', () => {
          // now that dimensions are available, we can start detection
          setLoaded(true)
          runDetection()
        })
      })
      .catch((err) => console.error('error starting video stream', err))
  }

  const runDetection = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const displaySize = { width: video.videoWidth, height: video.videoHeight }

    // guard against invalid dimensions
    if (displaySize.width === 0 || displaySize.height === 0) {
      // try again later
      setTimeout(runDetection, 100)
      return
    }

    faceapi.matchDimensions(canvas, displaySize)

    setInterval(async () => {
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions()
        .withAgeAndGender()

      const resized = faceapi.resizeResults(detections, displaySize)
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
      faceapi.draw.drawDetections(canvas, resized)

      if (detections.length > 0) {
        const d = detections[0]
        setGender(d.gender)
        setExpression(
          Object.entries(d.expressions).reduce((p, c) => (c[1] > p[1] ? c : p))[0]
        )
      }
    }, 100)
  }

  return (
    <div className="app-container">
      <h1>EVA - Test</h1>
      <div className="video-wrapper">
        <video
          ref={videoRef}
          width="720"
          height="560"
          muted
        />
        <canvas ref={canvasRef} className="overlay" />
      </div>
      {loaded && (
        <div className="info">
          <p>Gender: {gender}</p>
          <p>Expression: {expression}</p>
        </div>
      )}
    </div>
  )
}

export default App
