import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, User, MapPin, Calendar, CheckCircle, AlertCircle, Plus, Minus, Trash2, ArrowRight, ArrowLeft } from 'lucide-react';
import {
  getAllProducts,
  getAllTimeSlots,
  getAllZones
} from '../../services/informationService';

const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

export default function PlaceOrder() {
  const [step, setStep] = useState(1); // 1: Products, 2: Customer Info, 3: Review & Submit
  const [products, setProducts] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [orderNumber, setOrderNumber] = useState(null);

  // Cart state
  const [cart, setCart] = useState([]);

  // Customer information state
  const [customerInfo, setCustomerInfo] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postcode: '',
    state: ''
  });

  // Building information state
  const [buildingInfo, setBuildingInfo] = useState({
    building_name: '',
    housing_type: '',
    zone_id: ''
  });

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [productsData, zonesData] = await Promise.all([
          getAllProducts(),
          getAllZones()
        ]);
        setProducts(productsData);
        setZones(zonesData);
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load product catalog. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Cart functions
  const addToCart = (product) => {
    const existing = cart.find(item => (item.product.id || item.product.product_id) === (product.id || product.product_id));
    if (existing) {
      setCart(cart.map(item =>
        (item.product.id || item.product.product_id) === (product.id || product.product_id)
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1, dismantle_required: false }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => (item.product.id || item.product.product_id) !== productId));
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity < 1) {
      removeFromCart(productId);
    } else {
      setCart(cart.map(item =>
        (item.product.id || item.product.product_id) === productId
          ? { ...item, quantity: newQuantity }
          : item
      ));
    }
  };

  const toggleDismantle = (productId) => {
    setCart(cart.map(item =>
      (item.product.id || item.product.product_id) === productId
        ? { ...item, dismantle_required: !item.dismantle_required }
        : item
    ));
  };

  // Form validation
  const isStep1Valid = () => cart.length > 0;

  const isStep2Valid = () => {
    return (
      customerInfo.full_name.trim() &&
      customerInfo.email.trim() &&
      customerInfo.phone.trim() &&
      customerInfo.address.trim() &&
      customerInfo.city.trim() &&
      customerInfo.postcode.trim() &&
      customerInfo.state.trim() &&
      buildingInfo.building_name.trim() &&
      buildingInfo.housing_type.trim() &&
      buildingInfo.zone_id
    );
  };

  // Submit order
  const handleSubmitOrder = async () => {
    setSubmitting(true);
    setError(null);
    console.log('Submitting order with data:', {
      customer: customerInfo,
          building: buildingInfo,
          products: cart.map(item => ({
            product_id: item.product.id || item.product.product_id,
            quantity: item.quantity,
            dismantle_required: item.dismantle_required
          }))
    });
    try {
      // Create order via API
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer: customerInfo,
          building: buildingInfo,
          products: cart.map(item => ({
            product_id: item.product.id || item.product.product_id,
            quantity: item.quantity,
            dismantle_required: item.dismantle_required
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create order');
      }

      const data = await response.json();
      setOrderNumber(data.order?.id || data.order?.OrderID);
      setSuccess(true);
    } catch (err) {
      console.error('Order submission error:', err);
      setError('Failed to place order. Please try again or contact support.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading product catalog...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Placed Successfully!</h2>
          <p className="text-gray-600 mb-4">Your order has been confirmed.</p>
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">Order Number</p>
            <p className="text-2xl font-bold text-blue-600">{orderNumber}</p>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            We'll send you a confirmation email with delivery details shortly.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Place Another Order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <ShoppingCart className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Place an Order</h1>
                <p className="text-gray-600">Select products and schedule your delivery</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                1
              </div>
              <div className={`w-12 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                2
              </div>
              <div className={`w-12 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`} />
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                3
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Step 1: Product Selection */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Product Catalog */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Select Products</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {products.map(product => {
                    const productId = product.id || product.product_id;
                    const inCart = cart.find(item => (item.product.id || item.product.product_id) === productId);

                    return (
                      <div key={productId} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-gray-900">{product.product_name || product.ProductName}</h3>
                            <p className="text-xs text-gray-500">
                              {product.package_length_cm || product.PackageLengthCM}L × {product.package_width_cm || product.PackageWidthCM}W × {product.package_height_cm || product.PackageHeightCM}H cm
                            </p>
                          </div>
                          <Package className="h-5 w-5 text-gray-400" />
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {(product.fragile_flag || product.FragileFlag) && (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Fragile</span>
                          )}
                          {(product.installer_team_required_flag || product.InstallerTeamRequiredFlag) && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Installation Required</span>
                          )}
                          {(product.no_lie_down_flag || product.NoLieDownFlag) && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">Keep Upright</span>
                          )}
                        </div>
                        {inCart ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => updateQuantity(productId, inCart.quantity - 1)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="font-medium w-8 text-center">{inCart.quantity}</span>
                              <button
                                onClick={() => updateQuantity(productId, inCart.quantity + 1)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                            <button
                              onClick={() => removeFromCart(productId)}
                              className="text-red-600 hover:bg-red-50 p-2 rounded"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(product)}
                            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                          >
                            Add to Cart
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cart Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Cart Summary</h2>
                {cart.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Your cart is empty</p>
                ) : (
                  <>
                    <div className="space-y-3 mb-4">
                      {cart.map(item => (
                        <div key={item.product.id || item.product.product_id} className="border-b border-gray-100 pb-3">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-medium text-sm">{item.product.product_name || item.product.ProductName}</span>
                            <span className="text-sm">×{item.quantity}</span>
                          </div>
                          {(item.product.dismantle_required_flag || item.product.DismantleRequiredFlag) && (
                            <label className="flex items-center text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={item.dismantle_required}
                                onChange={() => toggleDismantle(item.product.id || item.product.product_id)}
                                className="mr-2"
                              />
                              Dismantle required
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-200 pt-4">
                      <div className="flex justify-between font-semibold text-lg mb-4">
                        <span>Total Items:</span>
                        <span>{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
                      </div>
                      <button
                        onClick={() => setStep(2)}
                        disabled={!isStep1Valid()}
                        className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        Continue to Delivery Details
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Customer & Delivery Information */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <User className="h-6 w-6 mr-2 text-blue-600" />
                Customer Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={customerInfo.full_name}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, full_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={customerInfo.email}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    type="tel"
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+60123456789"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                  <input
                    type="text"
                    value={customerInfo.state}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, state: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Kuala Lumpur"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                  <input
                    type="text"
                    value={customerInfo.address}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="123 Main Street, Apartment 4B"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                  <input
                    type="text"
                    value={customerInfo.city}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Petaling Jaya"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code *</label>
                  <input
                    type="text"
                    value={customerInfo.postcode}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, postcode: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="47500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <MapPin className="h-6 w-6 mr-2 text-blue-600" />
                Building Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Building Name *</label>
                  <input
                    type="text"
                    value={buildingInfo.building_name}
                    onChange={(e) => setBuildingInfo({ ...buildingInfo, building_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g. Sunway Tower"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Housing Type *</label>
                  <select
                    value={buildingInfo.housing_type}
                    onChange={(e) => setBuildingInfo({ ...buildingInfo, housing_type: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select type</option>
                    <option value="Apartment">Apartment</option>
                    <option value="Condominium">Condominium</option>
                    <option value="Landed House">Landed House</option>
                    <option value="Office">Office</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zone *</label>
                  <select
                    value={buildingInfo.zone_id}
                    onChange={(e) => setBuildingInfo({ ...buildingInfo, zone_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select zone</option>
                    {zones.map(zone => (
                      <option key={zone.id} value={zone.id}>
                        {zone.zone_name || zone.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Products
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!isStep2Valid()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
              >
                Review Order
                <ArrowRight className="h-4 w-4 ml-2" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Submit */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Order Summary</h2>

              {/* Products */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-700 mb-3">Products</h3>
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={item.product.id || item.product.product_id} className="flex justify-between text-sm">
                      <span>{item.product.product_name || item.product.ProductName} × {item.quantity}</span>
                      {item.dismantle_required && <span className="text-orange-600">(Dismantle required)</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer Info */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-700 mb-3">Customer Information</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-600">Name:</span> {customerInfo.full_name}</div>
                  <div><span className="text-gray-600">Email:</span> {customerInfo.email}</div>
                  <div><span className="text-gray-600">Phone:</span> {customerInfo.phone}</div>
                  <div className="col-span-2"><span className="text-gray-600">Address:</span> {customerInfo.address}, {customerInfo.city}, {customerInfo.state} {customerInfo.postcode}</div>
                </div>
              </div>

              {/* Building Info */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-700 mb-3">Building Information</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-600">Building:</span> {buildingInfo.building_name}</div>
                  <div><span className="text-gray-600">Type:</span> {buildingInfo.housing_type}</div>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Details
              </button>
              <button
                onClick={handleSubmitOrder}
                disabled={submitting}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Placing Order...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Place Order
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
