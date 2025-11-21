import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GlassCard } from '@/components/ui/glass-card';
import { useNavigate, Link } from 'react-router-dom';
import { Camera, CheckCircle, Upload, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const FaceVerification = () => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [aadharImage, setAadharImage] = useState<File | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(1); // 1: Capture Face, 2: Upload Document, 3: Verify
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      toast.error('Camera access denied');
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg');
        setCapturedImage(imageData);
        toast.success('Face captured!');
      }
    }
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAadharImage(file);
      toast.success('Document uploaded!');
    }
  };

  const handleVerify = async () => {
    if (!capturedImage || !aadharImage) {
      toast.error('Please capture face and upload document');
      return;
    }

    setVerifying(true);
    setProgress(20);

    setTimeout(() => setProgress(50), 1000);

    setTimeout(async () => {
      setProgress(80);

      try {
        // Convert data URL to File
        const faceFile = dataURLToFile(capturedImage, 'face.jpg');
        const formData = new FormData();
        formData.append('faceImage', faceFile);
        formData.append('aadharImage', aadharImage);
        formData.append('email', localStorage.getItem('userEmail') || '');

        const response = await fetch('/api/auth/verify-face', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        if (data.success) {
          setProgress(100);
          setVerified(true);
          toast.success('Face and document verified! OTP sent.');
          setTimeout(() => navigate('/otp-verification'), 2000);
        } else {
          toast.error(data.error || 'Verification failed');
        }
      } catch (error) {
        console.error('Verification error:', error);
        toast.error('Verification error: ' + (error.message || 'Network error'));
      }

      setVerifying(false);
    }, 2000);
  };

  // Helper to convert data URL to File
  const dataURLToFile = (dataURL: string, filename: string) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute w-96 h-96 bg-gold/10 rounded-full blur-3xl top-0 right-0 animate-float" />
        <div className="absolute w-96 h-96 bg-gold/5 rounded-full blur-3xl bottom-0 left-0 animate-float" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Link to="/signup" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to signup
        </Link>

        <GlassCard className="space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-gold-gradient flex items-center justify-center mb-4">
              <Camera className="w-8 h-8 text-background" />
            </div>
            <h1 className="text-3xl font-bold text-gold-gradient">Step 2: Face & Document Verification</h1>
            <p className="text-muted-foreground">Live capture and document upload</p>
          </div>

          <div className="space-y-4">
            {step === 1 && (
              <div className="space-y-4">
                <video ref={videoRef} autoPlay className="w-full h-64 bg-gray-900 rounded-lg" />
                <canvas ref={canvasRef} className="hidden" />
                <Button onClick={captureImage} className="w-full bg-gold-gradient">
                  Capture Face
                </Button>
                {capturedImage && (
                  <Button onClick={() => setStep(2)} className="w-full">
                    Next: Upload Document
                  </Button>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="aadharImage" className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-gold" />
                    Upload Aadhar Document
                  </Label>
                  <Input
                    id="aadharImage"
                    type="file"
                    accept="image/*"
                    onChange={handleDocumentChange}
                    className="glass-panel border-glass-border focus:border-gold"
                    required
                  />
                </div>
                <Button onClick={() => setStep(1)} className="w-full">
                  Back: Recapture Face
                </Button>
                <Button onClick={() => setStep(3)} className="w-full bg-gold-gradient">
                  Verify Face & Document
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-gold h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                </div>
                <Button onClick={handleVerify} disabled={verifying} className="w-full bg-gold-gradient">
                  {verifying ? 'Verifying...' : 'Verify'}
                </Button>
                {verified && <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />}
              </div>
            )}
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
};

export default FaceVerification;
