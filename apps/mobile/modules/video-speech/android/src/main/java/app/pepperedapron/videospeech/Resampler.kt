package app.pepperedapron.videospeech

/** Pure audio maths, kept free of Android classes so it can be unit-tested on the JVM. */
object Resampler {
  /**
   * Interleaved samples (any rate, any channel count) → mono at 16 kHz, by averaging the channels
   * then linear interpolation (plenty for speech recognition).
   */
  fun toMono16k(interleaved: FloatArray, sampleRate: Int, channels: Int): FloatArray {
    require(sampleRate > 0 && channels > 0) { "Invalid audio format" }
    val frames = interleaved.size / channels
    val mono = FloatArray(frames)
    for (f in 0 until frames) {
      var sum = 0f
      for (c in 0 until channels) sum += interleaved[f * channels + c]
      mono[f] = sum / channels
    }
    if (sampleRate == SpeechAudio.SAMPLE_RATE || frames == 0) return mono
    val ratio = sampleRate.toDouble() / SpeechAudio.SAMPLE_RATE
    val outFrames = (frames / ratio).toInt()
    val out = FloatArray(outFrames)
    for (i in 0 until outFrames) {
      val pos = i * ratio
      val j = pos.toInt()
      val frac = (pos - j).toFloat()
      val a = mono[j]
      val b = if (j + 1 < frames) mono[j + 1] else a
      out[i] = a + (b - a) * frac
    }
    return out
  }
}
