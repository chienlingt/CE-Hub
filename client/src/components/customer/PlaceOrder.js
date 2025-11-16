import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, User, CheckCircle, AlertCircle, Shuffle } from 'lucide-react';
import { getAllProducts, getAllZones } from '../../services/informationService';

const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

export default function PlaceOrder() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [orderNumber, setOrderNumber] = useState(null);
  const [buildingInfo, setBuildingInfo] = useState(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [cart, setCart] = useState([]);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [productsData, zonesData, customersData] = await Promise.all([
          getAllProducts(),
          getAllZones(),
          fetch(`${REACT_APP_API_BASE_URL}/api/customers`).then(res => res.json())
        ]);
        setProducts(productsData);
        setZones(zonesData);
        setCustomers(customersData);
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load data. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Random product selection
  const selectRandomProducts = () => {
    if (products.length === 0) return;

    const numProducts = Math.floor(Math.random() * 3) + 1; // 1-3 products
    const selectedProducts = [];
    const availableProducts = [...products];

    for (let i = 0; i < numProducts && availableProducts.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableProducts.length);
      const product = availableProducts.splice(randomIndex, 1)[0];
      const quantity = Math.floor(Math.random() * 2) + 1; // 1-2 quantity

      selectedProducts.push({
        product,
        quantity,
        dismantle_required: product.dismantle_required_flag && Math.random() > 0.5
      });
    }

    setCart(selectedProducts);
  };

  // Submit order
  const handleSubmitOrder = async () => {
    if (!selectedCustomerId) {
      setError('Please select a customer');
      return;
    }

    if (cart.length === 0) {
      setError('Please add products to cart');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer: {
            full_name: selectedCustomer.full_name,
            email: selectedCustomer.email,
            phone: selectedCustomer.phone,
            address: selectedCustomer.address || 'Address not specified',
            city: selectedCustomer.city || 'Kuala Lumpur',
            postcode: selectedCustomer.postcode || '50000',
            state: selectedCustomer.state || 'Selangor'
          },
          building: {
            housing_type: 'Residential',
            zone_id: zones.length > 0 ? zones[0].id : null
          },
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
      setOrderNumber(data.order?.id);
      setBuildingInfo(data.buildingInfo);
      setSuccess(true);
    } catch (err) {
      console.error('Order submission error:', err);
      setError('Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600">Order Number</p>
            <p className="text-xl font-bold text-blue-600">{orderNumber}</p>
          </div>
          {buildingInfo && (
            <div className="bg-green-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600">Building</p>
              <p className="text-lg font-semibold text-green-700">{buildingInfo.buildingName}</p>
              <p className="text-xs text-gray-600 mt-1">
                {buildingInfo.isExisting ? 'Using existing building (shared access constraints)' : 'New building created'}
              </p>
            </div>
          )}
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

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center">
            <ShoppingCart className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Demo Order Placement</h1>
              <p className="text-gray-600">Quick order creation for testing</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Customer Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <User className="h-5 w-5 mr-2 text-blue-600" />
              Select Customer
            </h2>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            >
              <option value="">-- Select a customer --</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name} ({customer.email})
                </option>
              ))}
            </select>

            {selectedCustomer && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1"><strong>Name:</strong> {selectedCustomer.full_name}</p>
                <p className="text-sm text-gray-600 mb-1"><strong>Email:</strong> {selectedCustomer.email}</p>
                <p className="text-sm text-gray-600 mb-1"><strong>Phone:</strong> {selectedCustomer.phone || 'N/A'}</p>
                <p className="text-sm text-gray-600"><strong>Address:</strong> {selectedCustomer.address || 'N/A'}</p>
              </div>
            )}
          </div>

          {/* Product Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Package className="h-5 w-5 mr-2 text-blue-600" />
              Products
            </h2>
            <button
              onClick={selectRandomProducts}
              className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center mb-4"
            >
              <Shuffle className="h-4 w-4 mr-2" />
              Randomly Select Products
            </button>

            {cart.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Selected Products:</p>
                {cart.map((item, idx) => (
                  <div key={idx} className="text-sm text-gray-600 mb-2 pb-2 border-b border-gray-200 last:border-0">
                    <p><strong>{item.product.product_name}</strong> x {item.quantity}</p>
                    {item.dismantle_required && (
                      <p className="text-orange-600 text-xs">Dismantle required</p>
                    )}
                    {item.product.installer_team_required_flag && (
                      <p className="text-blue-600 text-xs">Installation team required</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <button
            onClick={handleSubmitOrder}
            disabled={submitting || !selectedCustomerId || cart.length === 0}
            className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center text-lg font-semibold"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Placing Order...
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 mr-2" />
                Place Order
              </>
            )}
          </button>
          {(!selectedCustomerId || cart.length === 0) && (
            <p className="text-sm text-gray-500 text-center mt-2">
              {!selectedCustomerId ? 'Please select a customer' : 'Please select products'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
