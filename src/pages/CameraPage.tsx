import React from 'react';
import { useNavigate } from 'react-router-dom';
import CameraFilterModal from '@/components/camera/CameraFilterModal';

const CameraPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <CameraFilterModal
      isOpen={true}
      onClose={() => navigate(-1)}
      onCaptureMedia={(url, type) => {
        // Can route to create post with captured media
        navigate('/create-post', { state: { capturedMediaUrl: url, mediaType: type } });
      }}
    />
  );
};

export default CameraPage;
